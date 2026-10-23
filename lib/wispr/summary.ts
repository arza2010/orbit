import type { SyncResult } from "./sync";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One plain-English line describing what a sync did. */
export function summarise(r: SyncResult): string {
  const parts: string[] = [];
  if (r.imported.length) parts.push(`Imported ${plural(r.imported.length, "class", "classes")}. Writing the notes now.`);
  if (r.unmatched.length) parts.push(`${plural(r.unmatched.length, "recording")} need${r.unmatched.length === 1 ? "s" : ""} a class.`);
  if (r.failed.length) parts.push(`${plural(r.failed.length, "recording")} failed and will be retried next time.`);
  if (r.stillRecording) parts.push(`${plural(r.stillRecording, "recording")} still in progress.`);
  if (!parts.length) parts.push(r.alreadyHave ? "Everything is up to date." : "No new recordings found.");
  return parts.join(" ");
}
