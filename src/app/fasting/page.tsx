"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, Coffee, Droplets, Flame, MoonStar, Play, Square } from "lucide-react";

const allowed = [
  "Water",
  "Sparkling water",
  "Black coffee",
  "Plain unsweetened tea",
  "Zero-calorie electrolytes",
  "Zero-calorie flavored water, if it does not trigger cravings",
];

const breaksFast = [
  "Bone broth",
  "Protein shake",
  "Creatine mixed with calories",
  "Almond milk",
  "Oikos",
  "Cottage cheese",
  "Eggs",
  "Fruit",
  "Chocolate",
  "Any food or drink with calories",
];

const STORAGE_KEY = "fasting-session";

type FastingSession = {
  startedAt: string;
  targetHours: number;
  endedAt: string | null;
};

export default function FastingPage() {
  const [session, setSession] = useState<FastingSession | null>(() => {
    if (typeof window === "undefined") return null;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved ? (JSON.parse(saved) as FastingSession) : null;
  });
  const [targetHours, setTargetHours] = useState(() => session?.targetHours || 14);
  const [now, setNow] = useState(() => Date.now());
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">(
    () =>
      typeof window !== "undefined" && "Notification" in window
        ? Notification.permission
        : "unsupported"
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const targetEnd = useMemo(() => {
    if (!session) return null;
    return new Date(new Date(session.startedAt).getTime() + session.targetHours * 60 * 60 * 1000);
  }, [session]);

  const elapsedMs = session ? Math.max(0, now - new Date(session.startedAt).getTime()) : 0;
  const remainingMs = targetEnd ? Math.max(0, targetEnd.getTime() - now) : targetHours * 60 * 60 * 1000;
  const isComplete = Boolean(session && targetEnd && now >= targetEnd.getTime());

  useEffect(() => {
    if (!session || !targetEnd || session.endedAt) return;
    const completionDelay = targetEnd.getTime() - Date.now();
    if (completionDelay <= 0) return;

    const timeoutId = window.setTimeout(() => {
      void notify("Fast complete", `Your ${session.targetHours}-hour fast is complete.`);
    }, completionDelay);

    return () => window.clearTimeout(timeoutId);
  }, [session, targetEnd]);

  async function requestNotifications() {
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      setMessage("This browser does not support notifications.");
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    setMessage(permission === "granted" ? "Notifications enabled." : "Notifications not enabled.");
  }

  async function notify(title: string, body: string) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: "fasting-timer",
    });
  }

  async function startFast() {
    const nextSession: FastingSession = {
      startedAt: new Date().toISOString(),
      targetHours,
      endedAt: null,
    };
    setSession(nextSession);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
    setMessage("Fast started.");
    await notify("Fast started", `You started a ${targetHours}-hour fast.`);
  }

  async function endFast() {
    if (!session) return;
    const nextSession = { ...session, endedAt: new Date().toISOString() };
    setSession(nextSession);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
    setMessage("Fast ended.");
    await notify("Fast ended", "You ended your fast.");
  }

  function resetFast() {
    setSession(null);
    window.localStorage.removeItem(STORAGE_KEY);
    setMessage("Timer reset.");
  }

  return (
    <main className="app-shell">
      <div className="mx-auto max-w-5xl">
        <p className="eyebrow mb-2 text-xs font-semibold">Recovery mode</p>
        <h1 className="mb-6 text-4xl font-bold">Fasting Timer</h1>

        <div className="surface mb-4 rounded-3xl p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-lime-300 text-black">
                <MoonStar className="h-5 w-5" />
              </span>
              <div>
                <div className="muted text-sm">Current fast</div>
                <div className="text-xl font-semibold">
                  {session
                    ? session.endedAt
                      ? "Fast ended"
                      : isComplete
                        ? "Fast complete"
                        : "Fasting now"
                    : "Not fasting"}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={requestNotifications}
              className="inline-flex items-center gap-2 rounded-2xl bg-white/8 px-4 py-3 font-semibold"
            >
              <Bell className="h-4 w-4" />
              {notificationPermission === "granted" ? "Notifications on" : "Enable notifications"}
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <Window label="Elapsed" value={formatDuration(elapsedMs)} />
            <Window label="Remaining" value={formatDuration(remainingMs)} />
            <Window
              label="Target end"
              value={targetEnd ? targetEnd.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—"}
            />
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[180px_1fr]">
            <label className="block">
              <span className="text-sm font-medium">Target hours</span>
              <input
                className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
                type="number"
                min="1"
                max="48"
                value={targetHours}
                disabled={Boolean(session && !session.endedAt)}
                onChange={(event) => setTargetHours(Number(event.target.value))}
              />
            </label>
            <div className="flex flex-wrap items-end gap-3">
              {!session || session.endedAt ? (
                <button
                  onClick={startFast}
                  className="inline-flex items-center gap-2 rounded-2xl bg-lime-300 px-5 py-3 font-semibold text-black"
                >
                  <Play className="h-4 w-4" />
                  Start fast
                </button>
              ) : (
                <button
                  onClick={endFast}
                  className="inline-flex items-center gap-2 rounded-2xl bg-rose-300 px-5 py-3 font-semibold text-black"
                >
                  <Square className="h-4 w-4" />
                  End fast
                </button>
              )}
              <button onClick={resetFast} className="rounded-2xl bg-white/8 px-5 py-3 font-semibold">
                Reset
              </button>
            </div>
          </div>
          {message && <p className="muted mt-3 text-sm">{message}</p>}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <ListCard title="Allowed During Fasting" icon={Droplets} items={allowed} tone="lime" />
          <ListCard title="Breaks the Fast" icon={Flame} items={breaksFast} tone="rose" />
        </div>

        <div className="surface mt-4 rounded-3xl p-5">
          <div className="mb-3 flex items-center gap-3">
            <Coffee className="h-5 w-5 text-cyan-300" />
            <h2 className="text-xl font-semibold">Important note</h2>
          </div>
          <p className="muted">
            Bone broth can be useful for appetite control, but it has calories, so keep it inside the eating window.
          </p>
        </div>
      </div>
    </main>
  );
}

function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function Window({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-strong rounded-2xl p-4">
      <div className="muted text-sm">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function ListCard({
  title,
  items,
  icon: Icon,
  tone,
}: {
  title: string;
  items: string[];
  icon: typeof Droplets;
  tone: "lime" | "rose";
}) {
  return (
    <section className="surface rounded-3xl p-5">
      <div className="mb-4 flex items-center gap-3">
        <Icon className={tone === "lime" ? "h-5 w-5 text-lime-300" : "h-5 w-5 text-rose-300"} />
        <h2 className="text-xl font-semibold">{title}</h2>
      </div>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item} className="surface-strong rounded-2xl px-4 py-3 text-sm text-slate-200">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
