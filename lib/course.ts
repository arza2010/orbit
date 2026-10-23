/** "Data 102 with Vinay Sharma" -> "Data 102" */
export function shortCourse(title: string | null | undefined): string {
  if (!title) return "";
  return title.split(/\s+with\s+/i)[0].trim();
}

// Stable hue per course so a subject keeps its colour everywhere in the app.
export function courseHue(title: string | null | undefined): number {
  if (!title) return 255;
  const key = shortCourse(title).toLowerCase();
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Stay in the lively range: skip muddy yellow-greens.
  const palette = [258, 190, 330, 150, 28, 210, 290, 355, 170, 45];
  return palette[Math.abs(h) % palette.length];
}

export const hsl = (hue: number, s = 85, l = 66, a = 1) =>
  `hsl(${hue} ${s}% ${l}% / ${a})`;
