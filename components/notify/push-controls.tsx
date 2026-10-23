"use client";

import { BellRing, CheckCircle2, Loader2, Share, Smartphone } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { removePushSubscription, savePushSubscription, sendTestNotification } from "@/app/(app)/inbox/actions";
import { cn } from "@/lib/utils";

type State = "checking" | "unsupported" | "needs-install" | "blocked" | "off" | "on";

function keyToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob((base64Url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function detect(knownEndpoints: string[]): Promise<State> {
  const hasPush = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

  // iPhones only allow web push for apps added to the Home Screen.
  if (isIOS && !standalone) return "needs-install";
  if (!hasPush) return "unsupported";
  if (Notification.permission === "denied") return "blocked";

  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  return sub && knownEndpoints.includes(sub.endpoint) && Notification.permission === "granted" ? "on" : "off";
}

export function PushControls({ vapidKey, knownEndpoints }: { vapidKey: string; knownEndpoints: string[] }) {
  const [state, setState] = useState<State>("checking");
  const [note, setNote] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let live = true;
    detect(knownEndpoints).then((s) => live && setState(s));
    return () => {
      live = false;
    };
  }, [knownEndpoints]);

  const enable = () =>
    start(async () => {
      setNote(null);
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "blocked" : "off");
          setNote({ tone: "bad", text: "Notifications weren't allowed on this device." });
          return;
        }
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(vapidKey) });
        const json = sub.toJSON();
        const res = await savePushSubscription({
          endpoint: sub.endpoint,
          p256dh: json.keys?.p256dh ?? "",
          auth: json.keys?.auth ?? "",
          userAgent: navigator.userAgent.slice(0, 280),
        });
        if (res.error) throw new Error(res.error);
        setState("on");
        setNote({ tone: "good", text: "This device will now get your alerts." });
      } catch (err) {
        setNote({ tone: "bad", text: err instanceof Error ? err.message : "Couldn't turn notifications on." });
      }
    });

  const disable = () =>
    start(async () => {
      setNote(null);
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    });

  const test = () =>
    start(async () => {
      const r = await sendTestNotification();
      setNote(r.error ? { tone: "bad", text: r.error } : { tone: "good", text: r.message ?? "Sent." });
    });

  return (
    <div className="glass p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className={cn("grid size-11 place-items-center rounded-2xl border border-line", state === "on" ? "bg-lime/10 text-lime" : "bg-surface text-cyan")}>
            {state === "on" ? <CheckCircle2 className="size-5" /> : <BellRing className="size-5" />}
          </span>
          <div>
            <div className="text-sm font-semibold">This device</div>
            <div className="text-xs text-faint">
              {state === "checking" && "Checking…"}
              {state === "on" && "Notifications are on"}
              {state === "off" && "Notifications are off"}
              {state === "blocked" && "Blocked in your browser settings"}
              {state === "unsupported" && "This browser can't receive push notifications"}
              {state === "needs-install" && "Add Orbit to your Home Screen first"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {state === "off" && (
            <button onClick={enable} disabled={pending} className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-black transition-transform hover:scale-[1.02] disabled:opacity-60">
              {pending && <Loader2 className="size-4 animate-spin" />} Turn on notifications
            </button>
          )}
          {state === "on" && (
            <>
              <button onClick={test} disabled={pending} className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-medium transition-colors hover:bg-surface-2 disabled:opacity-60">
                {pending && <Loader2 className="size-4 animate-spin" />} Send a test
              </button>
              <button onClick={disable} disabled={pending} className="h-10 rounded-full px-3 text-sm text-faint transition-colors hover:bg-danger/10 hover:text-danger">
                Turn off
              </button>
            </>
          )}
        </div>
      </div>

      {state === "needs-install" && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 text-sm text-muted">
          <Smartphone className="mt-0.5 size-4 shrink-0 text-cyan" />
          <p>
            On iPhone, notifications only work for apps on the Home Screen. In Safari tap <Share className="mx-0.5 inline size-3.5" /> <b className="text-text">Share</b>, choose{" "}
            <b className="text-text">Add to Home Screen</b>, open Orbit from there, then come back to this page.
          </p>
        </div>
      )}
      {state === "blocked" && (
        <p className="mt-4 text-sm text-muted">Notifications are blocked for this site. Allow them in your browser or system settings, then reload.</p>
      )}
      {note && (
        <p role="status" className={cn("mt-4 text-sm", note.tone === "good" ? "text-lime" : "text-danger")}>
          {note.text}
        </p>
      )}
    </div>
  );
}
