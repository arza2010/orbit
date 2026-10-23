"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireUser } from "@/lib/auth";
import { processNote } from "@/lib/notes/process";
import { disconnect, assignRecording as assign, dismissRecording as dismiss, syncNow } from "@/lib/wispr/service";
import { NotConnectedError, WisprAuthExpiredError } from "@/lib/wispr/tokens";
import { summarise } from "@/lib/wispr/summary";

export type SyncState = { status: "idle" | "ok" | "error" | "reconnect"; message?: string };

/** Writes notes for new transcripts two at a time, so a backlog doesn't run one after another. */
async function processAll(ids: string[]) {
  const queue = [...ids];
  await Promise.all(
    Array.from({ length: Math.min(2, queue.length) }, async () => {
      for (let id = queue.shift(); id; id = queue.shift()) await processNote(id);
    }),
  );
}

// useActionState passes the previous state as the first argument.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function syncWispr(_prev: SyncState): Promise<SyncState> {
  const user = await requireUser();
  try {
    const result = await syncNow(user.id);
    const ids = result.imported.map((i) => i.id);
    if (ids.length) after(() => processAll(ids));
    revalidatePath("/notes");
    return { status: "ok", message: summarise(result) };
  } catch (err) {
    if (err instanceof NotConnectedError) return { status: "error", message: "Connect Wispr first." };
    if (err instanceof WisprAuthExpiredError) return { status: "reconnect", message: err.message };
    console.error("syncWispr failed", err instanceof Error ? err.message : err);
    return { status: "error", message: "Couldn't reach Wispr. Try again in a moment." };
  }
}

export async function disconnectWispr() {
  await requireUser();
  await disconnect();
  revalidatePath("/notes");
}

export type AssignState = { error?: string };

export async function assignRecording(noteId: string, _prev: AssignState, formData: FormData): Promise<AssignState> {
  const user = await requireUser();
  const eventId = String(formData.get("event") ?? "");
  if (!eventId) return { error: "Pick the class this recording belongs to." };
  try {
    const result = await assign(user.id, noteId, eventId);
    if (!result.ok) return { error: result.error };
    after(() => processNote(result.id));
    revalidatePath("/notes");
    return {};
  } catch (err) {
    if (err instanceof WisprAuthExpiredError) return { error: err.message };
    console.error("assignRecording failed", err instanceof Error ? err.message : err);
    return { error: "Couldn't fetch that recording. Try again." };
  }
}

export async function dismissRecording(noteId: string) {
  await requireUser();
  await dismiss(noteId);
  revalidatePath("/notes");
}
