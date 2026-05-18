"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Save, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Food, MealRule, MealSlot, MealTemplate, MealTemplateItem, Profile } from "@/lib/types";

type DraftItem = {
  foodId: string;
  amount: number;
  amountMode: "serving" | "grams";
};

export default function MealsPage() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [templates, setTemplates] = useState<MealTemplate[]>([]);
  const [templateItems, setTemplateItems] = useState<MealTemplateItem[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [templateSlot, setTemplateSlot] = useState<MealSlot>("breakfast");
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [foodSearch, setFoodSearch] = useState("");
  const [selectedFoodId, setSelectedFoodId] = useState("");
  const [amount, setAmount] = useState(1);
  const [amountMode, setAmountMode] = useState<"serving" | "grams">("serving");
  const [message, setMessage] = useState("");
  const [rules, setRules] = useState<MealRule[]>([]);
  const [mealStyle, setMealStyle] = useState("");
  const [isGeneratingAiMeal, setIsGeneratingAiMeal] = useState(false);
  const [creationMode, setCreationMode] = useState<"manual" | "ai">("manual");
  const [generationState, setGenerationState] = useState<"idle" | "generating" | "success">("idle");
  const [mealSearch, setMealSearch] = useState("");
  const [mealSlotFilter, setMealSlotFilter] = useState<MealSlot | "all">("all");
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null);

  useEffect(() => {
    async function loadInitialData() {
      const supabase = createClient();
      const [{ data: foodData }, { data: profileData }] = await Promise.all([
        supabase.from("foods").select("*").order("name"),
        supabase.from("meal_profiles").select("*").order("name"),
      ]);

      const loadedProfiles = (profileData || []) as Profile[];
      setFoods((foodData || []) as Food[]);
      setProfiles(loadedProfiles);
      const rememberedProfileId = window.localStorage.getItem("selected-profile-id");
      const nextProfileId =
        loadedProfiles.find((profile) => profile.id === rememberedProfileId)?.id ||
        loadedProfiles[0]?.id ||
        "";
      setSelectedProfileId(nextProfileId);
    }

    loadInitialData();
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
    async function loadTemplatesAndRules() {
      if (!selectedProfileId) return;
      const supabase = createClient();
      const [
        { data: templateData, error: templateError },
        { data: itemData, error: itemError },
        { data: ruleData, error: ruleError },
      ] =
        await Promise.all([
          supabase
            .from("meal_templates")
            .select("*")
            .or(`profile_id.eq.${selectedProfileId},profile_id.is.null`)
            .order("name"),
          supabase.from("meal_template_items").select("*"),
          supabase
            .from("meal_rules")
            .select("*")
            .eq("profile_id", selectedProfileId)
            .order("created_at"),
        ]);

      if (templateError || itemError || ruleError) {
        setMessage(templateError?.message || itemError?.message || ruleError?.message || "Could not load meals.");
        return;
      }

      setTemplates((templateData || []) as MealTemplate[]);
      setTemplateItems((itemData || []) as MealTemplateItem[]);
      setRules((ruleData || []) as MealRule[]);
    }

    loadTemplatesAndRules();
  }, [selectedProfileId]);

  const visibleFoods = foods.filter(
    (food) => food.profile_id == null || !selectedProfileId || food.profile_id === selectedProfileId
  );
  const selectedFood = visibleFoods.find((food) => food.id === selectedFoodId);
  const canUseGrams = Boolean(selectedFood?.base_grams);
  const matchingFoods = visibleFoods
    .filter((food) => food.name.toLowerCase().includes(foodSearch.toLowerCase()))
    .slice(0, 8);

  function chooseFood(food: Food) {
    setSelectedFoodId(food.id);
    setFoodSearch(food.name);
    setAmountMode(food.serving_mode === "grams" ? "grams" : "serving");
    setAmount(food.serving_mode === "grams" ? Number(food.base_grams || 100) : 1);
  }

  function addDraftItem() {
    if (!selectedFoodId) return;
    setDraftItems((current) => [...current, { foodId: selectedFoodId, amount, amountMode }]);
    setSelectedFoodId("");
    setFoodSearch("");
    setAmount(1);
    setAmountMode("serving");
  }

  function removeDraftItem(index: number) {
    setDraftItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function saveTemplate() {
    if (!templateName || draftItems.length === 0) {
      setMessage("Add a meal name and at least one food.");
      return;
    }

    const supabase = createClient();
    const { data: template, error } = await supabase
      .from("meal_templates")
      .insert({
        profile_id: selectedProfileId || null,
        name: templateName,
        meal_slot: templateSlot,
      })
      .select()
      .single();

    if (error) {
      setMessage(error.message);
      return;
    }

    const rows = draftItems.map((item) => ({
      meal_template_id: template.id,
      food_id: item.foodId,
      amount: item.amount,
      amount_mode: item.amountMode,
    }));

    const { data: createdItems, error: itemsError } = await supabase
      .from("meal_template_items")
      .insert(rows)
      .select("*");
    if (itemsError) {
      setMessage(itemsError.message);
      return;
    }

    setTemplates((current) => [...current, template as MealTemplate]);
    setTemplateItems((current) => [...current, ...((createdItems || []) as MealTemplateItem[])]);
    setTemplateName("");
    setTemplateSlot("breakfast");
    setDraftItems([]);
    setMessage("Meal template saved.");
  }

  async function generateAiMeal() {
    const profile = profiles.find((entry) => entry.id === selectedProfileId);
    if (!profile) {
      setMessage("Choose a profile first.");
      return;
    }

    setIsGeneratingAiMeal(true);
    setGenerationState("generating");
    setMessage("");
    try {
      const response = await fetch("/api/meal-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile,
          foods: visibleFoods.filter((food) => food.is_available !== false),
          rules,
          meal_slot: templateSlot,
          style: mealStyle,
        }),
      });
      const payload = (await response.json()) as {
        meal_name?: string;
        items?: { food_id: string; amount: number }[];
        error?: string;
      };

      if (!response.ok || !payload.meal_name || !payload.items) {
        setMessage(payload.error || "AI could not create a meal.");
        setGenerationState("idle");
        return;
      }

      setTemplateName(payload.meal_name);
      setDraftItems(
        payload.items.map((item) => ({
          foodId: item.food_id,
          amount: item.amount,
          amountMode:
            visibleFoods.find((food) => food.id === item.food_id)?.serving_mode === "grams"
              ? "grams"
              : "serving",
        }))
      );
      setMessage("AI meal created. Review it, then save.");
      setGenerationState("success");
    } catch {
      setMessage("AI meal generation failed before the server returned a response.");
      setGenerationState("idle");
    } finally {
      setIsGeneratingAiMeal(false);
    }
  }

  async function deleteTemplate(templateId: string) {
    const { error } = await createClient().from("meal_templates").delete().eq("id", templateId);
    if (error) {
      setMessage(error.message);
      return;
    }
    setTemplates((current) => current.filter((template) => template.id !== templateId));
    setTemplateItems((current) => current.filter((item) => item.meal_template_id !== templateId));
    setMessage("Meal deleted.");
  }

  async function toggleDefaultDaily(template: MealTemplate) {
    const supabase = createClient();
    const nextValue = !template.is_default_daily;
    if (nextValue && template.meal_slot) {
      await supabase
        .from("meal_templates")
        .update({ is_default_daily: false })
        .eq("profile_id", selectedProfileId)
        .eq("meal_slot", template.meal_slot);
    }
    const { error } = await supabase
      .from("meal_templates")
      .update({ is_default_daily: nextValue })
      .eq("id", template.id);
    if (error) {
      setMessage(error.message);
      return;
    }
    setTemplates((current) =>
      current.map((entry) =>
        entry.id === template.id
          ? { ...entry, is_default_daily: nextValue }
          : nextValue && entry.meal_slot === template.meal_slot && entry.profile_id === selectedProfileId
            ? { ...entry, is_default_daily: false }
            : entry
      )
    );
  }

  const visibleTemplates = templates.filter((template) => {
    const matchesSlot = mealSlotFilter === "all" || template.meal_slot === mealSlotFilter;
    const matchesSearch = template.name.toLowerCase().includes(mealSearch.toLowerCase());
    return matchesSlot && matchesSearch;
  });

  return (
    <main className="app-shell">
      <div className="mx-auto grid max-w-6xl gap-4">
        <section className="surface rounded-3xl p-5">
          <p className="eyebrow mb-2 text-xs font-semibold">Meal builder</p>
          <h1 className="mb-2 text-3xl font-bold">Create meal</h1>
          <p className="muted mb-4 text-sm">
            Build one meal at a time here. Review and manage all saved meals on the right.
          </p>

          <div className="mb-4 flex gap-2">
            <button
              type="button"
              onClick={() => setCreationMode("manual")}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                creationMode === "manual" ? "bg-lime-300 text-black" : "bg-white/8"
              }`}
            >
              Create manually
            </button>
            <button
              type="button"
              onClick={() => setCreationMode("ai")}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                creationMode === "ai" ? "bg-lime-300 text-black" : "bg-white/8"
              }`}
            >
              Create with AI
            </button>
          </div>

          <div className="rounded-3xl bg-white/[0.03] p-4">
            <div className="grid grid-cols-2 gap-3">
              <input className="col-span-2 rounded-2xl border border-white/10 bg-white/5 p-3 text-white" placeholder="Meal name" value={templateName} onChange={(event) => setTemplateName(event.target.value)} />
              <select className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white" value={templateSlot} onChange={(event) => setTemplateSlot(event.target.value as MealSlot)}>
                <option value="breakfast">Breakfast</option>
                <option value="snack_1">Snack 1</option>
                <option value="lunch">Lunch</option>
                <option value="snack_2">Snack 2</option>
                <option value="dinner">Dinner</option>
              </select>
              <select className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white" value={selectedProfileId} onChange={(event) => setSelectedProfileId(event.target.value)}>
                {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
              </select>
            </div>
          </div>

          {creationMode === "ai" && (
            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
              <input
                className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
                placeholder="Style: Latin, simple, high protein..."
                value={mealStyle}
                onChange={(event) => setMealStyle(event.target.value)}
              />
              <button
                onClick={generateAiMeal}
                disabled={isGeneratingAiMeal}
                className="rounded-2xl bg-white/8 px-5 py-3 font-semibold disabled:opacity-60"
              >
                {isGeneratingAiMeal ? "Designing..." : "Design AI meal"}
              </button>
            </div>
          )}

          {creationMode === "manual" && (
          <div className="mt-4 rounded-3xl bg-white/[0.03] p-4">
            <p className="mb-3 text-sm font-semibold text-slate-200">Add foods</p>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-[1fr_120px_120px_auto]">
            <div className="relative col-span-2 lg:col-span-1">
              <input className="w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-white lg:min-w-0" placeholder="Search food" value={foodSearch} onChange={(event) => { setFoodSearch(event.target.value); setSelectedFoodId(""); }} />
              {foodSearch && !selectedFood && matchingFoods.length > 0 && (
                <div className="surface absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl">
                  {matchingFoods.map((food) => (
                    <button key={food.id} type="button" onClick={() => chooseFood(food)} className="flex w-full items-center justify-between gap-3 border-b border-white/8 px-4 py-3 text-left text-sm last:border-b-0 hover:bg-white/8">
                      <span>{food.name}</span><span className="muted">{food.serving_label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <input className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white" type="number" min="0" step={amountMode === "grams" ? "5" : "0.25"} value={amount} onChange={(event) => setAmount(Number(event.target.value))} />
            <select
              className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
              value={amountMode}
              onChange={(event) => {
                const nextMode = event.target.value as "serving" | "grams";
                setAmountMode(nextMode);
                if (!selectedFood) return;
                setAmount(nextMode === "grams" ? Number(selectedFood.base_grams || 1) : 1);
              }}
            >
              <option value="serving">Serving</option>
              <option value="grams" disabled={!canUseGrams}>Grams</option>
            </select>
            <button onClick={addDraftItem} className="col-span-2 inline-flex items-center justify-center gap-2 rounded-2xl bg-white/8 px-4 py-3 font-semibold lg:col-span-1"><Plus className="h-4 w-4" />Add</button>
            </div>
          </div>
          )}

          <div className="mt-4 space-y-2">
            {draftItems.map((item, index) => {
              const food = foods.find((entry) => entry.id === item.foodId);
              if (!food) return null;
              return (
                <div key={`${item.foodId}-${index}`} className="surface-strong flex items-center justify-between rounded-2xl p-3">
                  <div><div className="font-medium">{food.name}</div><div className="muted text-sm">{item.amount} {item.amountMode === "grams" ? "g" : food.serving_label}</div></div>
                  <button onClick={() => removeDraftItem(index)} className="rounded-xl bg-white/6 p-2"><Trash2 className="h-4 w-4" /></button>
                </div>
              );
            })}
          </div>

          <button onClick={saveTemplate} className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-lime-300 px-5 py-3 font-semibold text-black"><Save className="h-4 w-4" />Save Meal</button>
          {message && <p className="muted mt-3 text-sm">{message}</p>}
        </section>

        <section className="surface rounded-3xl p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow mb-2 text-xs font-semibold">Meal library</p>
              <h2 className="text-3xl font-bold">Saved meals</h2>
            </div>
            <div className="muted text-sm">{visibleTemplates.length} shown · {templates.length} total</div>
          </div>

          <div className="mb-4 grid gap-3 md:grid-cols-[1fr_180px]">
            <input
              className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
              placeholder="Search saved meals"
              value={mealSearch}
              onChange={(event) => setMealSearch(event.target.value)}
            />
            <select
              className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
              value={mealSlotFilter}
              onChange={(event) => setMealSlotFilter(event.target.value as MealSlot | "all")}
            >
              <option value="all">All meal types</option>
              <option value="breakfast">Breakfast</option>
              <option value="snack_1">Snack 1</option>
              <option value="lunch">Lunch</option>
              <option value="snack_2">Snack 2</option>
              <option value="dinner">Dinner</option>
            </select>
          </div>

          <div className="space-y-3">
            {visibleTemplates.map((template) => {
              const items = templateItems.filter((item) => item.meal_template_id === template.id);
              const isExpanded = expandedTemplateId === template.id;
              return (
                <article key={template.id} className="surface-strong rounded-2xl p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setExpandedTemplateId(isExpanded ? null : template.id)}
                      className="flex min-w-0 flex-1 items-start justify-between gap-3 text-left"
                    >
                      <div>
                        <div className="font-semibold">{template.name}</div>
                        <div className="muted mt-1 text-xs">
                          {formatSlot(template.meal_slot)} · {items.length} item{items.length === 1 ? "" : "s"}
                        </div>
                      </div>
                      {isExpanded ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                    </button>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex items-center gap-2 rounded-xl bg-white/6 px-3 py-2 text-xs">
                        <input
                          type="checkbox"
                          checked={template.is_default_daily}
                          onChange={() => toggleDefaultDaily(template)}
                        />
                        Default daily
                      </label>
                      <button onClick={() => deleteTemplate(template.id)} className="rounded-xl bg-white/6 p-2">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 space-y-2 border-t border-white/8 pt-3">
                      {items.map((item) => {
                        const food = foods.find((entry) => entry.id === item.food_id);
                        if (!food) return null;
                        return (
                          <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-black/15 px-3 py-2 text-sm">
                            <span>{food.name}</span>
                            <span className="muted">
                              {item.amount} {item.amount_mode === "grams" || (!item.amount_mode && food.serving_mode === "grams") ? "g" : food.serving_label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </div>

      {generationState !== "idle" && (
        <GenerationModal
          title={generationState === "generating" ? "Generating meal" : "Meal generated"}
          body={
            generationState === "generating"
              ? "Designing a meal from the available foods and current profile targets."
              : "The meal was generated successfully. Review it, then save it."
          }
          onClose={generationState === "success" ? () => setGenerationState("idle") : undefined}
        />
      )}
    </main>
  );
}

function formatSlot(slot: MealSlot | null) {
  if (!slot) return "Unassigned";
  return slot.replace("_", " ");
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
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div className="modal-overlay fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <div className="modal-panel surface w-full max-w-md rounded-3xl p-6 text-center">
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
