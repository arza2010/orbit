import { DatabaseZap } from "lucide-react";

export function SetupNeeded() {
  return (
    <div className="glass mx-auto max-w-lg p-8 text-center">
      <DatabaseZap className="mx-auto mb-4 size-8 text-muted" />
      <h2 className="font-display text-3xl">One more step.</h2>
      <p className="mt-2 text-sm text-muted">
        Run <code className="font-mono">supabase/migrations/20261026000000_life_spaces.sql</code> in the Supabase SQL editor, then refresh. It adds spaces, projects, check-ins and reviews.
      </p>
    </div>
  );
}
