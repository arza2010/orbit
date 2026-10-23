"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** Long announcement text, clamped to a few lines with a toggle. Rendered as plain text. */
export function ExpandableText({ text, lines = 4 }: { text: string; lines?: number }) {
  const [open, setOpen] = useState(false);
  // Rough heuristic: only offer the toggle when the text is likely to be clamped.
  const long = text.length > 220 || text.split("\n").length > lines;

  return (
    <div>
      <p
        className={cn("whitespace-pre-line text-sm leading-relaxed text-muted", !open && "overflow-hidden")}
        style={open ? undefined : { display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical" }}
      >
        {text}
      </p>
      {long && (
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="mt-2 text-xs font-medium text-cyan transition-colors hover:text-text"
        >
          {open ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
}
