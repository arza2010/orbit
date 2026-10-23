import { Suspense, type ReactNode } from "react";
import { AccountCard, AccountMenu, AccountSkeleton } from "@/components/shell/account";
import { AppShell } from "@/components/shell/app-shell";
import { InboxBadge } from "@/components/shell/inbox-badge";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell
      account={
        <Suspense fallback={<AccountSkeleton />}>
          <AccountCard />
        </Suspense>
      }
      accountMobile={
        <Suspense fallback={null}>
          <AccountMenu />
        </Suspense>
      }
      inboxBadge={
        <Suspense fallback={null}>
          <InboxBadge />
        </Suspense>
      }
      inboxBadgeMobile={
        <Suspense fallback={null}>
          <InboxBadge compact />
        </Suspense>
      }
    >
      {children}
    </AppShell>
  );
}
