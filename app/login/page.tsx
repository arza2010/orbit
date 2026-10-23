import { Suspense } from "react";
import { AlertTriangle, Lock } from "lucide-react";
import { SplitText } from "@/components/motion/reveal";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata = { title: "Sign in · Orbit" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const MESSAGES: Record<string, string> = {
  forbidden: "That Google account isn't allowed in. This dashboard is private to its owner.",
  auth_failed: "Sign-in didn't complete. Please try again.",
  not_configured: "Supabase isn't configured yet. Add the keys to .env.local and restart.",
};

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.1 5.5c4.2-3.9 6.6-9.6 6.6-16.9z" />
      <path fill="#FBBC05" d="M10.5 28.7a14.4 14.4 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.1-5.5c-2 1.4-4.6 2.3-8.8 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

async function LoginCard({ searchParams }: { searchParams?: SearchParams }) {
  const sp = searchParams ? await searchParams : {};
  const raw = Array.isArray(sp.error) ? sp.error[0] : sp.error;
  const message = raw ? (MESSAGES[raw] ?? MESSAGES.auth_failed) : null;
  const unconfigured = !isSupabaseConfigured;

  return (
    <div className="glass w-full max-w-md p-8 sm:p-10">
      <div className="mb-8 flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-violet via-pink to-cyan text-lg font-bold text-black">
          H
        </div>
        <div className="leading-tight">
          <div className="text-lg font-semibold tracking-tight">Orbit</div>
          <div className="flex items-center gap-1.5 text-xs text-faint">
            <Lock className="size-3" /> Private dashboard
          </div>
        </div>
      </div>

      <h1 className="font-display text-5xl leading-[0.98] tracking-tight">
        <SplitText text="Welcome back." className="text-gradient italic" />
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-muted">
        Classes, deadlines and everything else in one place. Sign in with the Google account this dashboard belongs to.
      </p>

      {message && (
        <div
          role="alert"
          className="mt-6 flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {message}
        </div>
      )}

      {unconfigured && !message && (
        <div className="mt-6 rounded-2xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-amber">
          Supabase isn&apos;t configured yet, so the app is open in local development. Add the keys from SETUP.md to turn
          sign-in on.
        </div>
      )}

      <a
        href="/auth/login"
        className="mt-8 flex h-12 w-full items-center justify-center gap-3 rounded-full bg-white text-[15px] font-semibold text-black transition-transform hover:scale-[1.02] active:scale-[0.99]"
      >
        <GoogleMark />
        Continue with Google
      </a>
    </div>
  );
}

export default function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="relative z-10 grid min-h-dvh place-items-center px-4 py-10">
      <Suspense fallback={<LoginCard />}>
        <LoginCard searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
