"use client";

import { useEffect, useState } from "react";
import { Activity, Save, Target, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { calculateGoalTargets } from "@/lib/goalCalculator";
import type { Profile } from "@/lib/types";

type ProfileForm = {
  id?: string;
  name: string;
  age: number;
  sex: "female" | "male";
  weightLb: number;
  heightIn: number;
  trainingDaysPerWeek: number;
  stepsPerDay: number;
  goalLossLb: number;
  goalDate: string;
};

const defaultForm: ProfileForm = {
  name: "Jazmin",
  age: 31,
  sex: "female",
  weightLb: 157,
  heightIn: 63,
  trainingDaysPerWeek: 4,
  stepsPerDay: 5000,
  goalLossLb: 15,
  goalDate: "2026-08-01",
};

export default function ProfilePage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [form, setForm] = useState<ProfileForm>(defaultForm);
  const [message, setMessage] = useState("");
  const result = calculateGoalTargets(form);

  useEffect(() => {
    loadProfiles();
  }, []);

  async function loadProfiles() {
    const { data, error } = await createClient().from("meal_profiles").select("*").order("name");
    if (error) {
      setMessage(error.message);
      return;
    }
    setProfiles((data || []) as Profile[]);
  }

  function updateField(field: keyof ProfileForm, value: string) {
    setForm((current) => ({
      ...current,
      [field]:
        field === "name" || field === "sex" || field === "goalDate"
          ? value
          : Number(value),
    }));
  }

  function loadProfile(profile: Profile) {
    setForm({
      id: profile.id,
      name: profile.name,
      age: profile.age,
      sex: profile.sex,
      weightLb: profile.weight_lb,
      heightIn: profile.height_in,
      trainingDaysPerWeek: profile.training_days_per_week,
      stepsPerDay: profile.steps_per_day,
      goalLossLb: profile.goal_loss_lb,
      goalDate: profile.goal_date,
    });
    window.localStorage.setItem("selected-profile-id", profile.id);
    setMessage(`${profile.name}'s profile loaded.`);
  }

  async function saveProfile() {
    const payload = {
      name: form.name,
      age: form.age,
      sex: form.sex,
      weight_lb: form.weightLb,
      height_in: form.heightIn,
      training_days_per_week: form.trainingDaysPerWeek,
      steps_per_day: form.stepsPerDay,
      goal_loss_lb: form.goalLossLb,
      goal_date: form.goalDate,
      calorie_target: result.calorieTarget,
      protein_target: result.proteinTarget,
      carbs_target: result.carbsTarget,
      fat_target: result.fatTarget,
    };

    const supabase = createClient();
    const query = form.id
      ? supabase.from("meal_profiles").update(payload).eq("id", form.id).select().single()
      : supabase.from("meal_profiles").insert(payload).select().single();
    const { data, error } = await query;

    if (error) {
      setMessage(error.message);
      return;
    }

    const saved = data as Profile;
    window.localStorage.setItem("selected-profile-id", saved.id);
    setForm((current) => ({ ...current, id: saved.id }));
    setMessage(`${saved.name}'s profile saved.`);
    await loadProfiles();
  }

  function startNewProfile() {
    setForm({ ...defaultForm, name: "" });
    setMessage("New profile ready.");
  }

  return (
    <main className="app-shell">
      <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[300px_1fr_1fr]">
        <aside className="surface rounded-3xl p-5">
          <p className="eyebrow mb-2 text-xs font-semibold">People</p>
          <h2 className="mb-4 text-2xl font-bold">Profiles</h2>
          <div className="space-y-2">
            {profiles.map((profile) => (
              <button
                key={profile.id}
                onClick={() => loadProfile(profile)}
                className="surface-strong w-full rounded-2xl px-4 py-3 text-left transition hover:border-lime-300/30"
              >
                {profile.name}
              </button>
            ))}
          </div>
          <button
            onClick={startNewProfile}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white/8 px-4 py-3 font-semibold"
          >
            <UserPlus className="h-4 w-4" />
            New profile
          </button>
        </aside>

        <section className="surface rounded-3xl p-5">
          <p className="eyebrow mb-2 text-xs font-semibold">Body inputs</p>
          <h1 className="mb-4 flex items-center gap-3 text-4xl font-bold">
            <Activity className="h-8 w-8 text-cyan-300" />
            Profile
          </h1>

          <div className="space-y-3">
            <TextInput label="Name" value={form.name} onChange={(v) => updateField("name", v)} />
            <Input label="Age" value={form.age} onChange={(v) => updateField("age", v)} />
            <Input label="Weight lb" value={form.weightLb} onChange={(v) => updateField("weightLb", v)} />
            <Input label="Height inches" value={form.heightIn} onChange={(v) => updateField("heightIn", v)} />
            <Input label="Training days/week" value={form.trainingDaysPerWeek} onChange={(v) => updateField("trainingDaysPerWeek", v)} />
            <Input label="Steps/day" value={form.stepsPerDay} onChange={(v) => updateField("stepsPerDay", v)} />
            <Input label="Goal loss lb" value={form.goalLossLb} onChange={(v) => updateField("goalLossLb", v)} />
            <label className="block">
              <span className="text-sm font-medium">Goal date</span>
              <input
                className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
                type="date"
                value={form.goalDate}
                onChange={(e) => updateField("goalDate", e.target.value)}
              />
            </label>
          </div>

          <button
            onClick={saveProfile}
            className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-lime-300 px-5 py-3 font-semibold text-black"
          >
            <Save className="h-4 w-4" />
            Save Profile
          </button>
          {message && <p className="muted mt-3 text-sm">{message}</p>}
        </section>

        <aside className="surface rounded-3xl p-5">
          <h2 className="mb-4 flex items-center gap-3 text-2xl font-bold">
            <Target className="h-6 w-6 text-lime-300" />
            Calculated Targets
          </h2>
          <div className="space-y-3">
            <Result label="BMR" value={`${result.bmr} calories`} />
            <Result label="Estimated TDEE" value={`${result.tdee} calories`} />
            <Result label="Needed Daily Deficit" value={`${result.requiredDailyDeficit} calories`} />
            <Result label="Daily Calories" value={`${result.calorieTarget} calories`} />
            <Result label="Protein" value={`${result.proteinTarget} g`} />
            <Result label="Carbs" value={`${result.carbsTarget} g`} />
            <Result label="Fat" value={`${result.fatTarget} g`} />
          </div>
        </aside>
      </div>
    </main>
  );
}

function Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function TextInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function Result({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-strong flex justify-between rounded-2xl p-3">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
