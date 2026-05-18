"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Scale, TrendingDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchMotivation } from "@/lib/motivation";
import type { Profile, ProgressLog } from "@/lib/types";

function getTodayKey() {
  return new Date().toLocaleDateString("en-CA");
}

export default function ProgressPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [logs, setLogs] = useState<ProgressLog[]>([]);
  const [weight, setWeight] = useState(0);
  const [bodyFat, setBodyFat] = useState(0);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadProfiles() {
      const { data } = await createClient().from("meal_profiles").select("*").order("name");
      const loadedProfiles = (data || []) as Profile[];
      setProfiles(loadedProfiles);
      const rememberedProfileId = window.localStorage.getItem("selected-profile-id");
      setSelectedProfileId(
        loadedProfiles.find((profile) => profile.id === rememberedProfileId)?.id ||
          loadedProfiles[0]?.id ||
          ""
      );
    }
    void loadProfiles();
  }, []);

  useEffect(() => {
    function syncSelectedProfile() {
      const rememberedProfileId = window.localStorage.getItem("selected-profile-id");
      if (rememberedProfileId) setSelectedProfileId(rememberedProfileId);
    }
    window.addEventListener("selected-profile-changed", syncSelectedProfile);
    return () => window.removeEventListener("selected-profile-changed", syncSelectedProfile);
  }, []);

  useEffect(() => {
    async function loadLogs() {
      if (!selectedProfileId) return;
      const { data } = await createClient()
        .from("progress_logs")
        .select("*")
        .eq("profile_id", selectedProfileId)
        .order("log_date", { ascending: false });
      setLogs((data || []) as ProgressLog[]);
    }
    void loadLogs();
  }, [selectedProfileId]);

  const profile = profiles.find((item) => item.id === selectedProfileId);
  const latestLog = logs[0];
  const analysis = useMemo(() => analyzeProgress(profile, latestLog), [profile, latestLog]);

  useEffect(() => {
    if (!profile) return;
    setWeight(latestLog?.weight_lb || profile.weight_lb);
    setBodyFat(latestLog?.body_fat_percentage || profile.current_body_fat_percentage || 0);
  }, [profile, latestLog]);

  async function saveLog() {
    if (!profile) return;
    const { data, error } = await createClient()
      .from("progress_logs")
      .upsert(
        {
          profile_id: profile.id,
          log_date: getTodayKey(),
          weight_lb: weight,
          body_fat_percentage: bodyFat || null,
          note: note || null,
        },
        { onConflict: "profile_id,log_date" }
      )
      .select("*")
      .single();
    if (error) {
      setMessage(error.message);
      return;
    }
    const { data: updatedProfile, error: profileError } = await createClient()
      .from("meal_profiles")
      .update({
        weight_lb: weight,
        current_body_fat_percentage: bodyFat || null,
      })
      .eq("id", profile.id)
      .select("*")
      .single();
    if (profileError) {
      setMessage(profileError.message);
      return;
    }
    setProfiles((current) =>
      current.map((item) => (item.id === profile.id ? (updatedProfile as Profile) : item))
    );
    const nextLogs = [data as ProgressLog, ...logs.filter((log) => log.log_date !== getTodayKey())];
    setLogs(nextLogs);
    const nextAnalysis = analyzeProgress(profile, data as ProgressLog);
    if (!nextAnalysis) return;
    const motivation = await fetchMotivation(
      nextAnalysis.status === "on_track" ? "progress_on_track" : "progress_needs_attention",
      profile.name,
      { weight_lb: weight, body_fat_percentage: bodyFat, status: nextAnalysis.status }
    );
    setMessage(motivation || "Progress saved.");
  }

  return (
    <main className="app-shell">
      <div className="mx-auto max-w-6xl space-y-4">
        <div>
          <p className="eyebrow mb-2 text-xs font-semibold">Progress</p>
          <h1 className="text-4xl font-bold">Weight & body-fat updates</h1>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <section className="surface rounded-3xl p-5">
            <h2 className="mb-4 flex items-center gap-3 text-2xl font-bold">
              <Scale className="h-6 w-6 text-lime-300" />
              Log today
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Weight lb" value={weight} onChange={setWeight} />
              <Field label="Body fat %" value={bodyFat} onChange={setBodyFat} />
            </div>
            <label className="mt-3 block">
              <span className="text-sm font-medium">Note</span>
              <textarea
                className="mt-1 min-h-24 w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
            <button
              onClick={saveLog}
              className="mt-4 rounded-2xl bg-lime-300 px-5 py-3 font-semibold text-black"
            >
              Save update
            </button>
            {message && <p className="muted mt-3 text-sm">{message}</p>}
          </section>

          <section className="surface rounded-3xl p-5">
            <h2 className="mb-4 flex items-center gap-3 text-2xl font-bold">
              <TrendingDown className="h-6 w-6 text-cyan-300" />
              Goal check
            </h2>
            {analysis ? (
              <div className="space-y-3">
                <Summary label="Status" value={analysis.label} />
                <Summary label="Expected weight today" value={`${analysis.expectedWeight.toFixed(1)} lb`} />
                <Summary label="Current gap" value={`${analysis.weightGap.toFixed(1)} lb`} />
                <Summary label="Goal weight" value={`${analysis.goalWeight.toFixed(1)} lb`} />
                <p className="muted text-sm">{analysis.recommendation}</p>
              </div>
            ) : (
              <p className="muted">Save a progress update to see goal tracking.</p>
            )}
          </section>
        </div>

        <section className="surface rounded-3xl p-5">
          <h2 className="mb-4 flex items-center gap-3 text-2xl font-bold">
            <Activity className="h-6 w-6 text-fuchsia-300" />
            History
          </h2>
          <div className="space-y-2">
            {logs.map((log) => (
              <div key={log.id} className="surface-strong grid gap-2 rounded-2xl p-4 sm:grid-cols-[140px_1fr_1fr]">
                <div>{log.log_date}</div>
                <div>{log.weight_lb} lb</div>
                <div>{log.body_fat_percentage ?? "—"}%</div>
              </div>
            ))}
            {logs.length === 0 && <p className="muted">No updates logged yet.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}

function analyzeProgress(profile?: Profile, latestLog?: ProgressLog) {
  if (!profile || !latestLog) return null;
  const start = new Date();
  const goal = new Date(profile.goal_date);
  const totalDays = Math.max(1, Math.ceil((goal.getTime() - start.getTime()) / 86400000));
  const targetLossPerDay = profile.goal_loss_lb / totalDays;
  const daysRemaining = Math.max(0, Math.ceil((goal.getTime() - Date.now()) / 86400000));
  const elapsedDays = Math.max(0, totalDays - daysRemaining);
  const goalWeight = profile.weight_lb - profile.goal_loss_lb;
  const expectedWeight = profile.weight_lb - targetLossPerDay * elapsedDays;
  const weightGap = latestLog.weight_lb - expectedWeight;
  const status = weightGap <= 1 ? "on_track" : "needs_attention";
  return {
    status,
    label: status === "on_track" ? "On track" : "Needs attention",
    expectedWeight,
    goalWeight,
    weightGap,
    recommendation:
      status === "on_track"
        ? "You are aligned with the timeline. Keep the current calorie target, meals, and activity steady."
        : "You are above the planned curve. Tighten meal adherence, review weekend drift, and consider more daily steps.",
  };
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-strong flex justify-between rounded-2xl p-3">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
