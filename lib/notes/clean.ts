// Models sometimes double-escape their JSON, so a line break arrives as the two characters "\" and "n"
// instead of a real newline. Notes then render as one giant line (and, if they open with "#", one giant heading).
// Applied when notes are saved and again when they are shown, which also repairs notes saved earlier.

const LITERAL_BREAK = /\\r?\\n|\\n/g;

export function fixEscapes(text: string): string {
  const literal = text.match(LITERAL_BREAK)?.length ?? 0;
  if (literal === 0) return text;
  const real = text.match(/\n/g)?.length ?? 0;
  // Real line breaks outnumbering the literal ones means the "\n" was written on purpose (code, a path).
  if (real > literal) return text;
  return text.replace(LITERAL_BREAK, "\n").replace(/\\t/g, "  ").replace(/\\"/g, '"');
}
