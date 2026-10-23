import { LogOut } from "lucide-react";
import { getUser } from "@/lib/auth";

function initials(name: string | null, email: string) {
  const src = name?.trim() || email;
  return src
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function Avatar({ name, email, avatar }: { name: string | null; email: string; avatar: string | null }) {
  return avatar ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={avatar} alt="" referrerPolicy="no-referrer" className="size-9 rounded-full object-cover" />
  ) : (
    <span className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-violet to-cyan text-xs font-bold text-black">
      {initials(name, email)}
    </span>
  );
}

function SignOut({ compact = false }: { compact?: boolean }) {
  return (
    <form action="/auth/signout" method="post">
      <button
        type="submit"
        title="Sign out"
        aria-label="Sign out"
        className={
          compact
            ? "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-text"
            : "grid size-8 place-items-center rounded-full text-faint transition-colors hover:bg-surface-2 hover:text-text"
        }
      >
        <LogOut className="size-4" />
        {compact && "Sign out"}
      </button>
    </form>
  );
}

/** Desktop sidebar card. */
export async function AccountCard() {
  const user = await getUser();
  if (!user) return null;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
      <Avatar name={user.name} email={user.email} avatar={user.avatar} />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-sm font-medium">{user.name ?? "Signed in"}</div>
        <div className="truncate text-xs text-faint">{user.email}</div>
      </div>
      {user.id !== "local-dev" && <SignOut />}
    </div>
  );
}

/** Phone: avatar button with a tiny menu, top-right. */
export async function AccountMenu() {
  const user = await getUser();
  if (!user) return null;
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center rounded-full ring-1 ring-white/15 [&::-webkit-details-marker]:hidden">
        <Avatar name={user.name} email={user.email} avatar={user.avatar} />
      </summary>
      <div className="glass absolute right-0 top-11 z-40 w-56 bg-[#0b0b15] p-2">
        <div className="px-3 py-2">
          <div className="truncate text-sm font-medium">{user.name ?? "Signed in"}</div>
          <div className="truncate text-xs text-faint">{user.email}</div>
        </div>
        {user.id !== "local-dev" && <SignOut compact />}
      </div>
    </details>
  );
}

export function AccountSkeleton() {
  return <div className="skeleton h-[62px] rounded-2xl" />;
}
