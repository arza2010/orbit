"use client";

import { motion } from "motion/react";
import { Bell, BookOpen, CalendarDays, Layers, NotebookPen, Rocket, Sun, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: LucideIcon; ready: boolean };

const ITEMS: Item[] = [
  { href: "/", label: "Today", icon: Sun, ready: true },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, ready: true },
  { href: "/courses", label: "Courses", icon: BookOpen, ready: true },
  { href: "/programs", label: "Programs", icon: Rocket, ready: true },
  { href: "/life", label: "Life", icon: Layers, ready: true },
  { href: "/notes", label: "Notes", icon: NotebookPen, ready: true },
  { href: "/inbox", label: "Inbox", icon: Bell, ready: true },
];

function NavLink({ item, active, layoutId, badge }: { item: Item; active: boolean; layoutId: string; badge?: ReactNode }) {
  const Icon = item.icon;
  const inner = (
    <>
      {active && (
        <motion.span
          layoutId={layoutId}
          className="absolute inset-0 rounded-2xl bg-white/10 ring-1 ring-white/15"
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
        />
      )}
      <Icon className="relative size-[18px]" strokeWidth={active ? 2.2 : 1.8} />
      <span className="relative">{item.label}</span>
      {badge && <span className="relative ml-auto">{badge}</span>}
    </>
  );
  const base =
    "relative flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-medium transition-colors max-md:flex-col max-md:gap-1 max-md:px-2 max-md:py-2 max-md:text-[11px]";

  if (!item.ready) {
    return (
      <span
        className={cn(base, "cursor-not-allowed text-faint/70")}
        title="Coming soon"
        aria-disabled
      >
        <Icon className="relative size-[18px]" strokeWidth={1.8} />
        <span className="relative">{item.label}</span>
      </span>
    );
  }
  return (
    <Link href={item.href} className={cn(base, active ? "text-text" : "text-muted hover:text-text")}>
      {inner}
    </Link>
  );
}

const isActive = (pathname: string | null, href: string) =>
  pathname === null ? false : href === "/" ? pathname === "/" : pathname.startsWith(href);

function NavItems({ variant, pathname, inboxBadge }: { variant: "desktop" | "mobile"; pathname: string | null; inboxBadge?: ReactNode }) {
  // On a phone the inbox is the bell at the top, so the bottom bar keeps to the main screens.
  const items = variant === "mobile" ? ITEMS.filter((item) => item.ready && item.href !== "/inbox") : ITEMS;
  return (
    <>
      {items.map((item) => (
        <NavLink
          key={item.href}
          item={item}
          active={isActive(pathname, item.href)}
          layoutId={variant === "mobile" ? "nav-pill-mobile" : "nav-pill-desktop"}
          badge={item.href === "/inbox" ? inboxBadge : undefined}
        />
      ))}
    </>
  );
}

// usePathname() is runtime data, so it lives behind Suspense. The fallback is the same
// nav with nothing highlighted, so the shell never flashes or blocks the page.
function ActiveNavItems({ variant, inboxBadge }: { variant: "desktop" | "mobile"; inboxBadge?: ReactNode }) {
  const pathname = usePathname();
  return <NavItems variant={variant} pathname={pathname} inboxBadge={inboxBadge} />;
}

export function AppShell({
  children,
  account,
  accountMobile,
  inboxBadge,
  inboxBadgeMobile,
}: {
  children: ReactNode;
  account: ReactNode;
  accountMobile: ReactNode;
  inboxBadge: ReactNode;
  inboxBadgeMobile: ReactNode;
}) {
  return (
    <div className="relative z-10 min-h-dvh md:pl-[248px]">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col gap-8 p-5 md:flex">
        <div className="flex items-center gap-3 px-2 pt-1">
          <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-violet via-pink to-cyan text-sm font-bold text-black">
            H
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-semibold tracking-tight">Orbit</div>
            <div className="text-xs text-faint">Your dashboard</div>
          </div>
        </div>
        <nav className="flex flex-col gap-1">
          <Suspense fallback={<NavItems variant="desktop" pathname={null} />}>
            <ActiveNavItems variant="desktop" inboxBadge={inboxBadge} />
          </Suspense>
        </nav>
        <div className="mt-auto">{account}</div>
      </aside>

      <div className="fixed right-4 top-[calc(env(safe-area-inset-top)+0.75rem)] z-40 flex items-center gap-2.5 md:hidden">
        <Link href="/inbox" aria-label="Inbox" className="relative grid size-9 place-items-center rounded-full border border-line bg-[#0b0b14]/80 text-muted backdrop-blur-xl transition-colors hover:text-text">
          <Bell className="size-[18px]" />
          <span className="absolute -right-1 -top-1">{inboxBadgeMobile}</span>
        </Link>
        {accountMobile}
      </div>

      <main className="mx-auto w-full max-w-[1180px] px-4 pb-32 pt-[calc(env(safe-area-inset-top)+4rem)] sm:px-8 md:pb-16 md:pt-10">{children}</main>

      {/* Mobile tab bar */}
      <nav className="fixed inset-x-3 bottom-[max(0.75rem,calc(env(safe-area-inset-bottom)-0.25rem))] z-30 flex justify-around rounded-[26px] border border-line bg-[#0b0b14]/80 p-1.5 backdrop-blur-xl md:hidden">
        <Suspense fallback={<NavItems variant="mobile" pathname={null} />}>
          <ActiveNavItems variant="mobile" />
        </Suspense>
      </nav>
    </div>
  );
}
