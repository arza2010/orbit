import { unreadCount } from "@/lib/notify/queries";
import { getUser } from "@/lib/auth";

/** Unread count for the bell. Quietly shows nothing if the notifications tables aren't set up yet. */
export async function InboxBadge({ compact = false }: { compact?: boolean }) {
  let n = 0;
  try {
    if (await getUser()) n = await unreadCount();
  } catch {
    return null;
  }
  if (n === 0) return null;
  const label = n > 99 ? "99+" : String(n);
  return (
    <span
      aria-label={`${n} unread`}
      className={
        compact
          ? "grid min-w-4 place-items-center rounded-full bg-pink px-1 text-[10px] font-bold leading-4 text-black"
          : "grid min-w-5 place-items-center rounded-full bg-pink px-1.5 text-[11px] font-bold leading-5 text-black"
      }
    >
      {label}
    </span>
  );
}
