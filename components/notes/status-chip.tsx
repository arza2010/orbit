import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NoteStatus } from "@/lib/notes/types";

const LOOK: Record<NoteStatus, { label: string; cls: string }> = {
  pending: { label: "Queued", cls: "bg-white/8 text-muted" },
  processing: { label: "Writing notes", cls: "bg-cyan/15 text-cyan" },
  done: { label: "Ready", cls: "bg-lime/15 text-lime" },
  failed: { label: "Failed", cls: "bg-danger/15 text-danger" },
  unmatched: { label: "Needs a class", cls: "bg-amber/15 text-amber" },
  ignored: { label: "Dismissed", cls: "bg-white/6 text-faint" },
};

export function StatusChip({ status }: { status: NoteStatus }) {
  const { label, cls } = LOOK[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold", cls)}>
      {status === "done" && <CheckCircle2 className="size-3" />}
      {status === "failed" && <TriangleAlert className="size-3" />}
      {(status === "pending" || status === "processing") && <Loader2 className="size-3 animate-spin" />}
      {label}
    </span>
  );
}
