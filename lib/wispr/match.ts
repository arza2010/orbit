// Decides which Nexus class a Wispr recording belongs to. Pure and dependency-free so it can be
// tested exhaustively. A wrong guess files notes under the wrong course, so it prefers "unsure"
// to guessing.

export type SessionLite = {
  id: string;
  course: string;
  title: string;
  startMs: number;
  endMs: number;
};

export type Recording = { startMs: number; endMs: number };

const MIN = 60_000;

const overlap = (a: Recording, b: { startMs: number; endMs: number }) =>
  Math.max(0, Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs));

export function matchSession(
  rec: Recording,
  sessions: SessionLite[],
): { session: SessionLite; overlapMs: number } | null {
  const recLen = rec.endMs - rec.startMs;
  if (recLen <= 0) return null;

  const scored = sessions
    .map((s) => {
      const o = overlap(rec, s);
      const len = s.endMs - s.startMs;
      return { s, o, coversClass: len > 0 ? o / len : 0, shareOfRecording: o / recLen };
    })
    // The recording must cover most of the class AND be mostly that class.
    // Otherwise a recording that merely brushes a class would be filed under it.
    .filter((x) => x.o >= 10 * MIN && x.coversClass >= 0.5 && x.shareOfRecording >= 0.4)
    .sort((a, b) => b.o - a.o);

  if (scored.length === 0) return null;
  // Two classes fit almost equally well (a long recording across back-to-back classes): ask the user.
  if (scored.length > 1 && scored[1].o >= 0.6 * scored[0].o) return null;
  return { session: scored[0].s, overlapMs: scored[0].o };
}
