"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Sparkles, Save, Target, UserPlus } from "lucide-react";
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
  goalInstruction: string;
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
  goalInstruction: "",
};

export default function ProfilePage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [form, setForm] = useState<ProfileForm>(defaultForm);
  const [message, setMessage] = useState("");
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [generationState, setGenerationState] = useState<"idle" | "generating" | "success">("idle");
  const result = calculateGoalTargets(form);

  const loadProfiles = useCallback(async () => {
    const { data, error } = await createClient().from("meal_profiles").select("*").order("name");
    if (error) {
      setMessage(error.message);
      return;
    }

    const loadedProfiles = (data || []) as Profile[];
    setProfiles(loadedProfiles);

    const rememberedProfileId = window.localStorage.getItem("selected-profile-id");
    const rememberedProfile = loadedProfiles.find(
      (profile) => profile.id === rememberedProfileId
    );

    if (rememberedProfile) {
      loadProfile(rememberedProfile, false, false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadProfiles();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadProfiles]);

  useEffect(() => {
    function syncSelectedProfile() {
      const rememberedProfileId = window.localStorage.getItem("selected-profile-id");
      const rememberedProfile = profiles.find((profile) => profile.id === rememberedProfileId);
      if (rememberedProfile) loadProfile(rememberedProfile, false, false);
    }

    window.addEventListener("selected-profile-changed", syncSelectedProfile);
    return () => window.removeEventListener("selected-profile-changed", syncSelectedProfile);
  }, [profiles]);

  function updateField(field: keyof ProfileForm, value: string) {
    setForm((current) => ({
      ...current,
      [field]:
        field === "name" || field === "sex" || field === "goalDate" || field === "goalInstruction"
          ? value
          : Number(value),
    }));
  }

  function loadProfile(profile: Profile, announce = true, broadcast = true) {
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
      goalInstruction: profile.goal_instruction || "",
    });
    window.localStorage.setItem("selected-profile-id", profile.id);
    if (broadcast) {
      window.dispatchEvent(new Event("selected-profile-changed"));
    }
    if (announce) {
      setMessage(`${profile.name}'s profile loaded.`);
    }
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
      goal_instruction: form.goalInstruction,
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
    window.dispatchEvent(new Event("selected-profile-changed"));
    setForm((current) => ({ ...current, id: saved.id }));
    setMessage(`${saved.name}'s profile saved.`);
    await loadProfiles();
  }

  function startNewProfile() {
    setForm({ ...defaultForm, name: "" });
    setMessage("New profile ready.");
  }

  async function generateNutritionPlan() {
    if (!form.id) {
      setMessage("Save this profile first, then generate the nutrition plan.");
      return;
    }
    if (!form.goalInstruction.trim()) {
      setMessage("Write a goal instruction first.");
      return;
    }

    setIsGeneratingPlan(true);
    setGenerationState("generating");
    setMessage("");
    const supabase = createClient();
    try {
      const targetPayload = {
        calorie_target: result.calorieTarget,
        protein_target: result.proteinTarget,
        carbs_target: result.carbsTarget,
        fat_target: result.fatTarget,
        goal_instruction: form.goalInstruction,
      };
      const { data: updatedProfile, error: updateError } = await supabase
        .from("meal_profiles")
        .update(targetPayload)
        .eq("id", form.id)
        .select("*")
        .single();
      if (updateError) {
        setMessage(updateError.message);
        setGenerationState("idle");
        return;
      }

      const [{ data: foodData }, { data: profileData }] = await Promise.all([
        supabase.from("foods").select("*").eq("is_available", true).order("name"),
        Promise.resolve({ data: updatedProfile }),
      ]);
      const foods = foodData || [];
      if (foods.length === 0) {
        setMessage("Mark at least one food as available before generating a plan.");
        setGenerationState("idle");
        return;
      }

      const response = await fetch("/api/nutrition-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: profileData,
          foods,
          goal_instruction: form.goalInstruction,
        }),
      });
      const payload = (await response.json()) as {
        plan_summary?: string;
        meals?: {
          meal_name: string;
          meal_slot: "breakfast" | "snack_1" | "lunch" | "dinner";
          items: { food_id: string; amount: number }[];
        }[];
        error?: string;
        details?: unknown;
      };
      if (!response.ok || !payload.meals) {
        setMessage(
          payload.error
            ? `${payload.error}${payload.details ? ` ${JSON.stringify(payload.details)}` : ""}`
            : "AI could not create the nutrition plan."
        );
        setGenerationState("idle");
        return;
      }

      const { data: oldTemplates } = await supabase
        .from("meal_templates")
        .select("id")
        .eq("profile_id", form.id);
      const oldTemplateIds = (oldTemplates || []).map((template) => template.id);
      if (oldTemplateIds.length > 0) {
        await supabase.from("meal_templates").delete().in("id", oldTemplateIds);
      }

      for (const meal of payload.meals) {
        const { data: template, error } = await supabase
          .from("meal_templates")
          .insert({
            profile_id: form.id,
            name: meal.meal_name,
            meal_slot: meal.meal_slot,
          })
          .select()
          .single();
        if (error) {
          setMessage(error.message);
          return;
        }
        await supabase.from("meal_template_items").insert(
          meal.items.map((item) => ({
            meal_template_id: template.id,
            food_id: item.food_id,
            amount: item.amount,
          }))
        );
      }

      setMessage(
        payload.plan_summary
          ? `Nutrition plan created. ${payload.plan_summary}`
          : "Nutrition plan created."
      );
      setGenerationState("success");
      await loadProfiles();
    } catch {
      setMessage("Nutrition plan generation failed before the server returned a response.");
      setGenerationState("idle");
    } finally {
      setIsGeneratingPlan(false);
    }
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
            <label className="block">
              <span className="text-sm font-medium">Sex</span>
              <select
                className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
                value={form.sex}
                onChange={(e) => updateField("sex", e.target.value)}
              >
                <option value="female">Female</option>
                <option value="male">Male</option>
              </select>
            </label>
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
            <label className="block">
              <span className="text-sm font-medium">Goal instruction</span>
              <textarea
                className="mt-1 min-h-28 w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
                placeholder="I want to lose fat and lose 5 pounds while keeping meals simple and high protein."
                value={form.goalInstruction}
                onChange={(e) => updateField("goalInstruction", e.target.value)}
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
          <button
            onClick={generateNutritionPlan}
            disabled={isGeneratingPlan}
            className="ml-3 mt-4 inline-flex items-center gap-2 rounded-2xl bg-white/8 px-5 py-3 font-semibold disabled:opacity-60"
          >
            <Sparkles className="h-4 w-4" />
            {isGeneratingPlan ? "Generating..." : "Generate nutrition plan"}
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
      {generationState !== "idle" && (
        <GenerationModal
          title={generationState === "generating" ? "Generating nutrition plan" : "Nutrition plan ready"}
          body={
            generationState === "generating"
              ? "Building meals from this profile, its goal, and the foods currently available."
              : "Your new nutrition plan and saved meals were generated successfully."
          }
          onClose={generationState === "success" ? () => setGenerationState("idle") : undefined}
        />
      )}
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

function GenerationModal({
  title,
  body,
  onClose,
}: {
  title: string;
  body: string;
  onClose?: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <div className="surface w-full max-w-md rounded-3xl p-6 text-center">
        <h2 className="text-2xl font-bold">{title}</h2>
        <p className="muted mt-3">{body}</p>
        {onClose ? (
          <button onClick={onClose} className="mt-5 rounded-2xl bg-lime-300 px-5 py-3 font-semibold text-black">
            Done
          </button>
        ) : (
          <div className="mx-auto mt-5 h-8 w-8 animate-spin rounded-full border-4 border-white/15 border-t-lime-300" />
        )}
      </div>
    </div>
  );
}
