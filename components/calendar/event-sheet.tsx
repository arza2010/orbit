"use client";

import { AnimatePresence, motion } from "motion/react";
import { ExternalLink, FileText, MapPin, Paperclip, UserRound, Video, X } from "lucide-react";
import { useEffect, useState } from "react";
import { dayLongLabel, type CalEvent } from "@/lib/calendar";
import { hsl } from "@/lib/course";

function useIsDesktop() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return desktop;
}

export function EventSheet({ event, onClose }: { event: CalEvent | null; onClose: () => void }) {
  const desktop = useIsDesktop();
  const off = desktop ? { x: "108%" } : { y: "108%" };

  useEffect(() => {
    if (!event) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [event, onClose]);

  return (
    <AnimatePresence>
      {event && (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
          />
          <motion.aside
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={event.course}
            data-lenis-prevent className="glass fixed inset-x-2 bottom-2 z-50 max-h-[86dvh] overflow-y-auto bg-[#0b0b15] p-6 md:inset-y-3 md:left-auto md:right-3 md:max-h-none md:w-[440px] md:p-8"
            initial={off}
            animate={{ x: 0, y: 0 }}
            exit={off}
            transition={{ type: "spring", stiffness: 340, damping: 38 }}
          >
            <div
              className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full opacity-70"
              style={{ background: `radial-gradient(circle, ${hsl(event.hue, 90, 60, 0.4)}, transparent 68%)` }}
            />
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute right-4 top-4 grid size-9 place-items-center rounded-full border border-line bg-surface text-muted transition-colors hover:bg-surface-2 hover:text-text"
            >
              <X className="size-4" />
            </button>

            <div className="relative">
              <div
                className="mb-3 text-xs font-semibold uppercase tracking-[0.2em]"
                style={{ color: hsl(event.hue, 90, 72) }}
              >
                {event.source === "google" ? "Google Calendar" : event.type === "session" ? "Class" : event.type}
                {event.cancelled && <span className="ml-2 text-danger">· Cancelled</span>}
              </div>
              <h2 className="pr-10 font-display text-4xl leading-tight tracking-tight">{event.course}</h2>
              {event.title !== event.course && <p className="mt-1 text-sm text-muted">{event.source === "google" ? event.group?.replace("Google · ", "") : event.title}</p>}

              <div className="mt-6 space-y-1 text-[15px]">
                <div>{dayLongLabel(event.dayKey)}</div>
                <div className="text-muted">{event.range}</div>
              </div>

              <div className="mt-6 flex flex-col gap-2.5 text-sm">
                {event.room && (
                  <Row icon={<MapPin className="size-4" />}>{event.room}</Row>
                )}
                {event.link && (
                  <Row icon={<Video className="size-4" />}>
                    <a href={event.link} target="_blank" rel="noopener noreferrer" className="underline decoration-white/30 underline-offset-4 hover:decoration-white">
                      Join online
                    </a>
                  </Row>
                )}
                {event.external && (
                  <Row icon={<ExternalLink className="size-4" />}>
                    <a href={event.external} target="_blank" rel="noopener noreferrer" className="underline decoration-white/30 underline-offset-4 hover:decoration-white">
                      Open in Google Calendar
                    </a>
                  </Row>
                )}
                {event.instructor && (
                  <Row icon={<UserRound className="size-4" />}>
                    <span>{event.instructor}</span>
                    {event.instructorLinkedIn && (
                      <a
                        href={event.instructorLinkedIn}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-3 inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-text"
                      >
                        LinkedIn <ExternalLink className="size-3" />
                      </a>
                    )}
                  </Row>
                )}
                {event.attendance && !event.cancelled && (
                  <span className="mt-1 w-fit rounded-full border border-line px-3 py-1 text-[11px] font-medium uppercase tracking-widest text-muted">
                    Attendance required
                  </span>
                )}
              </div>

              {event.notes && (
                <div className="mt-6">
                  <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                    <FileText className="size-3.5" /> {event.source === "google" ? "Description" : "Session notes"}
                  </h3>
                  <p className="whitespace-pre-wrap rounded-2xl border border-line bg-surface p-4 text-sm leading-relaxed text-muted">
                    {event.notes}
                  </p>
                </div>
              )}

              {event.attachments.length > 0 && (
                <div className="mt-6">
                  <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                    <Paperclip className="size-3.5" /> Attachments
                  </h3>
                  <ul className="flex flex-col gap-2">
                    {event.attachments.map((a, i) => (
                      <li key={i}>
                        {a.url ? (
                          <a
                            href={a.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3 text-sm transition-colors hover:bg-surface-2"
                          >
                            {a.name} <ExternalLink className="size-3.5 text-faint" />
                          </a>
                        ) : (
                          <span className="block rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">{a.name}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-muted">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-surface text-faint">{icon}</span>
      <div className="min-w-0 text-text/90">{children}</div>
    </div>
  );
}
