import "server-only";
import { decrypt, encrypt } from "@/lib/crypto";
import { nexus } from "@/lib/nexus";
import { createClient } from "@/lib/supabase/server";
import { dayKey } from "@/lib/time";
import { fetchTranscript, listMeetings } from "./api";
import type { SessionLite } from "./match";
import type { TokenSet } from "./oauth";
import { runSync, MIN_TRANSCRIPT_CHARS, type SyncResult } from "./sync";
import { getWisprClient, type ConnectionStore, type StoredConnection } from "./tokens";

// Everything here runs as the signed-in user, so row-level security applies to every query.

class SupabaseStore implements ConnectionStore {
  constructor(readonly key: string) {}

  async load(): Promise<StoredConnection | null> {
    const supabase = await createClient();
    const { data } = await supabase
      .from("integration_tokens")
      .select("client_id,access_token_enc,refresh_token_enc,expires_at")
      .eq("provider", "wispr")
      .maybeSingle();
    if (!data) return null;
    return {
      clientId: data.client_id as string,
      accessToken: decrypt(data.access_token_enc as string),
      refreshToken: data.refresh_token_enc ? decrypt(data.refresh_token_enc as string) : null,
      expiresAt: data.expires_at ? Date.parse(data.expires_at as string) : 0,
    };
  }

  async save(c: StoredConnection): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.from("integration_tokens").upsert(
      {
        provider: "wispr",
        client_id: c.clientId,
        access_token_enc: encrypt(c.accessToken),
        refresh_token_enc: c.refreshToken ? encrypt(c.refreshToken) : null,
        expires_at: new Date(c.expiresAt).toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" },
    );
    if (error) throw new Error("Could not save the Wispr connection");
  }
}

export const storeFor = (userId: string) => new SupabaseStore(userId);

export async function saveNewConnection(userId: string, clientId: string, t: TokenSet) {
  await storeFor(userId).save({ clientId, accessToken: t.accessToken, refreshToken: t.refreshToken, expiresAt: t.expiresAt });
}

export async function connectionStatus(): Promise<{ connected: boolean; lastSyncedAt: string | null }> {
  const supabase = await createClient();
  const { data } = await supabase.from("integration_tokens").select("last_synced_at").eq("provider", "wispr").maybeSingle();
  return { connected: !!data, lastSyncedAt: (data?.last_synced_at as string | null) ?? null };
}

export async function disconnect() {
  const supabase = await createClient();
  await supabase.from("integration_tokens").delete().eq("provider", "wispr");
}

/** Class sessions around a window, in the shape the matcher wants. */
async function nexusSessions(sinceIso: string, untilIso: string): Promise<SessionLite[]> {
  const events = await nexus.scheduleRange(dayKey(sinceIso), dayKey(new Date(Date.parse(untilIso) + 86_400_000)));
  return events
    .filter((e) => e.type === "session" && !e.cancelled && e.course)
    .map((e) => ({ id: e.id, course: e.course as string, title: e.title, startMs: Date.parse(e.start), endMs: Date.parse(e.end) }));
}

export async function syncNow(userId: string, lookbackDays = 14): Promise<SyncResult> {
  const store = storeFor(userId);
  const client = await getWisprClient(store);
  const supabase = await createClient();

  const result = await runSync(
    {
      listMeetings: (a, b) => listMeetings(client, a, b),
      fetchTranscript: (id) => fetchTranscript(client, id),
      sessions: nexusSessions,
      async existingIds() {
        const { data, error } = await supabase.from("class_notes").select("wispr_meeting_id").not("wispr_meeting_id", "is", null);
        if (error) throw new Error(error.message);
        return new Set((data ?? []).map((r) => r.wispr_meeting_id as string));
      },
      async insert(row) {
        const { data, error } = await supabase
          .from("class_notes")
          .upsert(row, { onConflict: "user_id,wispr_meeting_id", ignoreDuplicates: true })
          .select("id");
        if (error) throw new Error(error.message);
        return (data?.[0]?.id as string | undefined) ?? null;
      },
    },
    { now: Date.now(), lookbackDays },
  );

  await supabase.from("integration_tokens").update({ last_synced_at: new Date().toISOString() }).eq("provider", "wispr");
  return result;
}

export type AssignResult = { ok: true; id: string } | { ok: false; error: string };

/** Files an unmatched recording under a class the user chose. The class is looked up server-side. */
export async function assignRecording(userId: string, noteId: string, nexusEventId: string): Promise<AssignResult> {
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("class_notes")
    .select("id,status,wispr_meeting_id,wispr_start")
    .eq("id", noteId)
    .maybeSingle();
  if (!row || row.status !== "unmatched" || !row.wispr_meeting_id) return { ok: false, error: "That recording is no longer waiting for a class." };

  const around = Date.parse(row.wispr_start as string) || Date.now();
  const sessions = await nexusSessions(new Date(around - 2 * 86_400_000).toISOString(), new Date(around + 2 * 86_400_000).toISOString());
  const session = sessions.find((s) => s.id === nexusEventId);
  if (!session) return { ok: false, error: "Couldn't find that class in Nexus." };

  const transcript = await fetchTranscript(await getWisprClient(storeFor(userId)), row.wispr_meeting_id as string);
  if (transcript.length < MIN_TRANSCRIPT_CHARS) return { ok: false, error: "That recording's transcript is too short to make notes from." };

  const { error } = await supabase
    .from("class_notes")
    .update({
      course: session.course,
      nexus_event_id: session.id,
      session_start: new Date(session.startMs).toISOString(),
      session_end: new Date(session.endMs).toISOString(),
      transcript,
      status: "pending",
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", noteId)
    .eq("status", "unmatched");
  if (error) return { ok: false, error: "Couldn't save the class." };
  return { ok: true, id: noteId };
}

export async function dismissRecording(noteId: string) {
  const supabase = await createClient();
  await supabase.from("class_notes").update({ status: "ignored", updated_at: new Date().toISOString() }).eq("id", noteId).eq("status", "unmatched");
}
