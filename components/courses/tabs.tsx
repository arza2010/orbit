import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "courses", href: "/courses", label: "Courses" },
  { id: "attendance", href: "/courses/attendance", label: "Attendance" },
] as const;

/** Sits above the Courses and Attendance pages so they read as one section. */
export function CoursesTabs({ active }: { active: (typeof TABS)[number]["id"] }) {
  return (
    <nav aria-label="Courses section" className="mb-6 inline-flex rounded-full border border-line bg-surface p-1">
      {TABS.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          aria-current={active === t.id ? "page" : undefined}
          className={cn(
            "rounded-full px-4 py-2 text-sm font-medium transition-colors",
            active === t.id ? "bg-white/12 text-text ring-1 ring-white/15" : "text-muted hover:text-text",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
