"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useActionState } from "react";
import { rebuildDigest, type FormState } from "@/app/(app)/notes/actions";

export function DigestButton({ course, hasDigest }: { course: string; hasDigest: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(rebuildDigest.bind(null, course), {});
  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-medium transition-colors hover:bg-surface-2 disabled:opacity-60"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        {pending ? "Merging sessions…" : hasDigest ? "Rebuild consolidated notes" : "Build consolidated notes"}
      </button>
      {state.error && <p className="text-xs text-danger">{state.error}</p>}
    </form>
  );
}
