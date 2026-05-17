"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Plus, RefreshCw, Shuffle, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  buildTemplateOptions,
  chooseOptimizedDayPlan,
  getSlotOptions,
  planRemainingMealsByBudget,
  pickAlternative,
  plannerSlots,
  type TemplateOption,
} from "@/lib/mealPlanner";
import { calculateDailyTotals, calculateFoodMacros, roundMacros } from "@/lib/macroCalculator";
import type {
  DailyPlan,
  DailyPlanItem,
  DailyPlanMeal,
  Food,
  MealRule,
  MealSlot,
  MealTemplate,
  MealTemplateItem,
  Profile,
  SelectedFood,
} from "@/lib/types";
import MacroSummary from "@/components/MacroSummary";

type PlannedMeal = DailyPlanMeal & {
  items: DailyPlanItem[];
};

function getTodayKey() {
  return new Date().toLocaleDateString("en-CA");
}

export default function CalculatorPage() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [templates, setTemplates] = useState<MealTemplate[]>([]);
  const [templateItems, setTemplateItems] = useState<MealTemplateItem[]>([]);
  const [rules, setRules] = useState<MealRule[]>([]);
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [meals, setMeals] = useState<PlannedMeal[]>([]);
  const [checkedTodayPlan, setCheckedTodayPlan] = useState(false);
  const [message, setMessage] = useState("");
  const [foodSearch, setFoodSearch] = useState("");
  const [manualFoodId, setManualFoodId] = useState("");
  const [manualMealSlot, setManualMealSlot] = useState<MealSlot>("breakfast");
  const [manualAmount, setManualAmount] = useState(1);
  const [openMealSlot, setOpenMealSlot] = useState<MealSlot>("breakfast");
  const [freeDay, setFreeDay] = useState(false);
  const [showManualAdd, setShowManualAdd] = useState(false);

  useEffect(() => {
    async function loadCoreData() {
      const supabase = createClient();
      const [{ data: foodData }, { data: profileData }] = await Promise.all([
        supabase.from("foods").select("*").order("name"),
        supabase.from("meal_profiles").select("*").order("name"),
      ]);
      const loadedProfiles = (profileData || []) as Profile[];
      setFoods((foodData || []) as Food[]);
      setProfiles(loadedProfiles);
      const rememberedProfileId = window.localStorage.getItem("selected-profile-id");
      setSelectedProfileId(
        loadedProfiles.find((profile) => profile.id === rememberedProfileId)?.id ||
          loadedProfiles[0]?.id ||
          ""
      );
    }

    loadCoreData();
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
    async function loadPlannerData() {
      if (!selectedProfileId) return;
      const supabase = createClient();
      const [{ data: templateData }, { data: itemData }, { data: ruleData }] = await Promise.all([
        supabase
          .from("meal_templates")
          .select("*")
          .or(`profile_id.eq.${selectedProfileId},profile_id.is.null`)
          .order("name"),
        supabase.from("meal_template_items").select("*"),
        supabase.from("meal_rules").select("*").eq("profile_id", selectedProfileId),
      ]);
      setTemplates((templateData || []) as MealTemplate[]);
      setTemplateItems((itemData || []) as MealTemplateItem[]);
      setRules((ruleData || []) as MealRule[]);
    }

    loadPlannerData();
  }, [selectedProfileId]);

  useEffect(() => {
    if (!selectedProfileId) return;
    const timeoutId = window.setTimeout(() => {
      setFreeDay(
        window.localStorage.getItem(`free-day:${selectedProfileId}:${getTodayKey()}`) === "true"
      );
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [selectedProfileId]);

  useEffect(() => {
    async function loadTodayPlan() {
      if (!selectedProfileId) return;
      setCheckedTodayPlan(false);
      setPlan(null);
      setMeals([]);
      const supabase = createClient();
      const { data: planData } = await supabase
        .from("daily_plans")
        .select("*")
        .eq("profile_id", selectedProfileId)
        .eq("plan_date", getTodayKey())
        .maybeSingle();

      if (!planData) {
        setCheckedTodayPlan(true);
        return;
      }
      setPlan(planData as DailyPlan);

      const { data: mealData } = await supabase
        .from("daily_plan_meals")
        .select("*")
        .eq("daily_plan_id", planData.id)
        .order("meal_slot");
      const loadedMeals = (mealData || []) as DailyPlanMeal[];
      const { data: itemData } = await supabase
        .from("daily_plan_items")
        .select("*")
        .in(
          "daily_plan_meal_id",
          loadedMeals.map((meal) => meal.id)
        );
      setMeals(
        loadedMeals.map((meal) => ({
          ...meal,
          items: ((itemData || []) as DailyPlanItem[]).filter(
            (item) => item.daily_plan_meal_id === meal.id
          ),
        }))
      );
      const firstIncomplete =
        plannerSlots.find((slot) =>
          loadedMeals.some((meal) => meal.meal_slot === slot.key && !meal.completed)
        )?.key || "breakfast";
      setOpenMealSlot(firstIncomplete);
      setCheckedTodayPlan(true);
    }

    loadTodayPlan();
  }, [selectedProfileId]);

  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId);
  const options = useMemo(
    () => buildTemplateOptions(templates, templateItems, foods),
    [templates, templateItems, foods]
  );
  const selectedFoods = useMemo<SelectedFood[]>(
    () =>
      meals.flatMap((meal) =>
        meal.items
          .map((item) => {
            const food = foods.find((candidate) => candidate.id === item.food_id);
            return food
              ? { food, amount: Number(item.amount), mealSlot: meal.meal_slot }
              : null;
          })
          .filter((item): item is SelectedFood => item !== null)
      ),
    [meals, foods]
  );
  const totals = roundMacros(calculateDailyTotals(selectedFoods));
  const matchingFoods = foods
    .filter((food) =>
      `${food.name} ${food.brand || ""}`.toLowerCase().includes(foodSearch.toLowerCase())
    )
    .slice(0, 8);

  useEffect(() => {
    if (!selectedProfile || !checkedTodayPlan || plan || options.length === 0) return;
    void generatePlan();
  }, [selectedProfile, checkedTodayPlan, plan, options.length]);

  async function generatePlan() {
    if (!selectedProfile) return;
    const chosen = chooseOptimizedDayPlan(selectedProfile, options, rules, foods);
    if (chosen.some((entry) => !entry.selected)) {
      setMessage("Create at least one available saved meal for every meal slot first.");
      return;
    }

    const supabase = createClient();
    let activePlan = plan;
    if (activePlan) {
      await supabase.from("daily_plan_meals").delete().eq("daily_plan_id", activePlan.id);
    } else {
      const { data: createdPlan, error } = await supabase
        .from("daily_plans")
        .insert({ profile_id: selectedProfile.id, plan_date: getTodayKey() })
        .select("*")
        .single();
      if (error) {
        setMessage(error.message);
        return;
      }
      activePlan = createdPlan as DailyPlan;
    }

    const mealRows = chosen.map((entry) => ({
      daily_plan_id: activePlan!.id,
      meal_slot: entry.slot,
      meal_template_id: entry.selected!.template.id.startsWith("synthetic-")
        ? null
        : entry.selected!.template.id,
      meal_name: entry.selected!.template.name,
    }));
    const { data: createdMeals } = await supabase
      .from("daily_plan_meals")
      .insert(mealRows)
      .select("*");
    const rows = ((createdMeals || []) as DailyPlanMeal[]).flatMap((meal) => {
      const selected = chosen.find((entry) => entry.slot === meal.meal_slot)?.selected;
      const tunedItems = chosen.find((entry) => entry.slot === meal.meal_slot)?.tunedItems || [];
      return (tunedItems.length ? tunedItems : selected?.items || []).map((item) => ({
        daily_plan_meal_id: meal.id,
        food_id: item.food_id,
        amount: item.amount,
      }));
    });
    const { data: createdItems } = await supabase.from("daily_plan_items").insert(rows).select("*");
    setPlan(activePlan);
    setMeals(
      ((createdMeals || []) as DailyPlanMeal[]).map((meal) => ({
        ...meal,
        items: ((createdItems || []) as DailyPlanItem[]).filter(
          (item) => item.daily_plan_meal_id === meal.id
        ),
      }))
    );
    setOpenMealSlot("breakfast");
    setMessage("Today's meal plan is ready.");
  }


  async function replaceMeal(slot: MealSlot, option: TemplateOption) {
    const meal = meals.find((candidate) => candidate.meal_slot === slot);
    if (!meal) return;
    const supabase = createClient();
    await supabase.from("daily_plan_items").delete().eq("daily_plan_meal_id", meal.id);
    const { data: updatedMeal } = await supabase
      .from("daily_plan_meals")
      .update({
        meal_template_id: option.template.id.startsWith("synthetic-") ? null : option.template.id,
        meal_name: option.template.name,
        completed: false,
      })
      .eq("id", meal.id)
      .select("*")
      .single();
    const { data: newItems } = await supabase
      .from("daily_plan_items")
      .insert(
        option.items.map((item) => ({
          daily_plan_meal_id: meal.id,
          food_id: item.food_id,
          amount: item.amount,
        }))
      )
      .select("*");
    setMeals((current) =>
      current.map((entry) =>
        entry.id === meal.id
          ? { ...(updatedMeal as DailyPlanMeal), items: (newItems || []) as DailyPlanItem[] }
          : entry
      )
    );
  }

  async function replaceMealAndRebalance(slot: MealSlot, option: TemplateOption) {
    await replaceMeal(slot, option);
    const changedIndex = plannerSlots.findIndex((entry) => entry.key === slot);
    const refreshedMeals = meals.map((meal) =>
      meal.meal_slot === slot
        ? {
            ...meal,
            meal_template_id: option.template.id,
            meal_name: option.template.name,
            completed: false,
            items: option.items.map((item) => ({
              id: item.id,
              daily_plan_meal_id: meal.id,
              food_id: item.food_id,
              amount: item.amount,
            })),
          }
        : meal
    );
    await rebalanceFutureMeals(refreshedMeals, changedIndex);
  }

  async function shuffleMeal(slot: MealSlot) {
    const meal = meals.find((candidate) => candidate.meal_slot === slot);
    const next = pickAlternative(meal?.meal_template_id || null, slot, options, rules);
    if (!next) {
      setMessage("No other meal option is available for that slot.");
      return;
    }
    await replaceMeal(slot, next);
  }

  async function updateItemAmount(itemId: string, amount: number) {
    await createClient().from("daily_plan_items").update({ amount }).eq("id", itemId);
    const nextMeals = meals.map((meal) => ({
        ...meal,
        items: meal.items.map((item) => (item.id === itemId ? { ...item, amount } : item)),
      }));
    setMeals(nextMeals);

    const changedMeal = nextMeals.find((meal) =>
      meal.items.some((item) => item.id === itemId)
    );
    if (!changedMeal || !selectedProfile) return;

    const changedIndex = plannerSlots.findIndex((slot) => slot.key === changedMeal.meal_slot);
    if (!freeDay) await rebalanceFutureMeals(nextMeals, changedIndex);
  }

  async function rebalanceFutureMeals(sourceMeals: PlannedMeal[], changedIndex: number) {
    if (!selectedProfile) return;
    if (freeDay) {
      setMessage("Free day is on, so automatic recalculation is paused.");
      return;
    }
    const futureMeals = sourceMeals.filter(
      (meal) =>
        plannerSlots.findIndex((slot) => slot.key === meal.meal_slot) > changedIndex &&
        !meal.completed
    );
    const lockedMeals = sourceMeals.filter(
      (meal) =>
        plannerSlots.findIndex((slot) => slot.key === meal.meal_slot) <= changedIndex ||
        meal.completed
    );
    const lockedFoods = lockedMeals.flatMap((meal) =>
      meal.items
        .map((item) => {
          const food = foods.find((candidate) => candidate.id === item.food_id);
          return food ? { food, amount: Number(item.amount), mealSlot: meal.meal_slot } : null;
        })
        .filter((item): item is SelectedFood => item !== null)
    );
    const consumed = calculateDailyTotals(lockedFoods);
    if (exceedsTargets(consumed, selectedProfile)) {
      setMessage(
        "The meals already locked in are over the daily target, so there is no remaining macro budget to rebalance."
      );
      return;
    }
    if (futureMeals.length === 0) {
      setMessage("No unfinished future meals are left to rebalance.");
      return;
    }
    const replacementPlan = planRemainingMealsByBudget(
      selectedProfile,
      futureMeals.map((meal) => ({
        slot: meal.meal_slot,
        currentTemplateId: meal.meal_template_id,
      })),
      options,
      rules,
      foods,
      consumed
    );

    for (const replacement of replacementPlan) {
      const currentMeal = futureMeals.find((meal) => meal.meal_slot === replacement.slot);
      if (!currentMeal) continue;
      if (!replacement.selected) continue;
      await replaceMealWithItems(
        currentMeal,
        replacement.selected.template,
        replacement.tunedItems
      );
    }
    setMessage("Future meals were rebalanced and portion sizes were tuned after your change.");
  }

  async function toggleCompleted(mealId: string, completed: boolean) {
    await createClient().from("daily_plan_meals").update({ completed }).eq("id", mealId);
    setMeals((current) => {
      const nextMeals = current.map((meal) =>
        meal.id === mealId ? { ...meal, completed } : meal
      );
      if (completed) {
        const nextIncomplete = plannerSlots.find((slot) =>
          nextMeals.some((meal) => meal.meal_slot === slot.key && !meal.completed)
        );
        if (nextIncomplete) setOpenMealSlot(nextIncomplete.key);
      }
      return nextMeals;
    });
  }

  async function addManualFood() {
    const meal = meals.find((candidate) => candidate.meal_slot === manualMealSlot);
    if (!meal || !manualFoodId) return;
    const { data } = await createClient()
      .from("daily_plan_items")
      .insert({
        daily_plan_meal_id: meal.id,
        food_id: manualFoodId,
        amount: manualAmount,
      })
      .select("*")
      .single();
    const nextMeals = meals.map((entry) =>
        entry.id === meal.id ? { ...entry, items: [...entry.items, data as DailyPlanItem] } : entry
    );
    setMeals(nextMeals);
    setFoodSearch("");
    setManualFoodId("");
    if (!freeDay) {
      const changedIndex = plannerSlots.findIndex((slot) => slot.key === meal.meal_slot);
      await rebalanceFutureMeals(nextMeals, changedIndex);
    }
  }

  async function removeItem(itemId: string) {
    await createClient().from("daily_plan_items").delete().eq("id", itemId);
    const nextMeals = meals.map((meal) => ({ ...meal, items: meal.items.filter((item) => item.id !== itemId) }));
    setMeals(nextMeals);
    const changedMeal = meals.find((meal) => meal.items.some((item) => item.id === itemId));
    if (changedMeal && !freeDay) {
      const changedIndex = plannerSlots.findIndex((slot) => slot.key === changedMeal.meal_slot);
      await rebalanceFutureMeals(nextMeals, changedIndex);
    }
  }

  async function swapItemFood(item: DailyPlanItem, replacementFoodId: string) {
    const meal = meals.find((entry) => entry.items.some((candidate) => candidate.id === item.id));
    const currentFood = foods.find((food) => food.id === item.food_id);
    const replacementFood = foods.find((food) => food.id === replacementFoodId);
    if (!meal || !currentFood || !replacementFood) return;
    if (!["carb", "protein", "fat"].includes(currentFood.category)) return;

    const macroKey =
      currentFood.category === "protein"
        ? "protein"
        : currentFood.category === "carb"
          ? "carbs"
          : "fat";
    const currentMacroAmount = calculateFoodMacros(currentFood, Number(item.amount))[macroKey];
    const replacementBaseAmount =
      replacementFood.serving_mode === "grams" ? Number(replacementFood.base_grams || 100) : 1;
    const replacementBaseMacro =
      calculateFoodMacros(replacementFood, replacementBaseAmount)[macroKey];
    if (replacementBaseMacro <= 0) {
      setMessage("That replacement does not contain enough of the same macro to swap cleanly.");
      return;
    }
    const rawAmount = (currentMacroAmount / replacementBaseMacro) * replacementBaseAmount;
    const step = replacementFood.serving_mode === "grams" ? 5 : 0.25;
    const nextAmount = Math.max(step, Math.round(rawAmount / step) * step);

    await createClient()
      .from("daily_plan_items")
      .update({ food_id: replacementFood.id, amount: nextAmount })
      .eq("id", item.id);

    const nextMeals = meals.map((entry) => ({
      ...entry,
      items: entry.items.map((candidate) =>
        candidate.id === item.id
          ? { ...candidate, food_id: replacementFood.id, amount: nextAmount }
          : candidate
      ),
    }));
    setMeals(nextMeals);
    const changedIndex = plannerSlots.findIndex((slot) => slot.key === meal.meal_slot);
    if (!freeDay) await rebalanceFutureMeals(nextMeals, changedIndex);
    setMessage(`${currentFood.name} swapped for ${replacementFood.name}.`);
  }

  async function replaceMealWithItems(
    meal: PlannedMeal,
    template: MealTemplate,
    items: MealTemplateItem[]
  ) {
    const supabase = createClient();
    await supabase.from("daily_plan_items").delete().eq("daily_plan_meal_id", meal.id);
    const { data: updatedMeal } = await supabase
      .from("daily_plan_meals")
      .update({
        meal_template_id: template.id.startsWith("synthetic-") ? null : template.id,
        meal_name: template.name,
        completed: false,
      })
      .eq("id", meal.id)
      .select("*")
      .single();
    const { data: newItems } = await supabase
      .from("daily_plan_items")
      .insert(
        items.map((item) => ({
          daily_plan_meal_id: meal.id,
          food_id: item.food_id,
          amount: item.amount,
        }))
      )
      .select("*");
    setMeals((current) =>
      current.map((entry) =>
        entry.id === meal.id
          ? { ...(updatedMeal as DailyPlanMeal), items: (newItems || []) as DailyPlanItem[] }
          : entry
      )
    );
  }

  return (
    <main className="app-shell">
      <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[1fr_380px]">
        <section>
          <div className="mb-4 lg:hidden">
            <MacroSummary
              totals={totals}
              targets={{
                calories: selectedProfile?.calorie_target || 0,
                protein: selectedProfile?.protein_target || 0,
                carbs: selectedProfile?.carbs_target || 0,
                fat: selectedProfile?.fat_target || 0,
              }}
            />
          </div>

          <p className="eyebrow mb-2 text-xs font-semibold">Daily planner</p>
          <h1 className="mb-4 text-4xl font-bold">Today&apos;s Meal Plan</h1>

          <div className="surface mb-4 rounded-3xl p-5">
            <div className="flex flex-wrap gap-3">
              <button onClick={generatePlan} className="inline-flex items-center gap-2 rounded-2xl bg-lime-300 px-5 py-3 font-semibold text-black">
                <RefreshCw className="h-4 w-4" /> {plan ? "Redesign meal plan" : "Create meal plan"}
              </button>
              <button
                onClick={() => rebalanceFutureMeals(meals, -1)}
                disabled={freeDay || meals.length === 0}
                className="inline-flex items-center gap-2 rounded-2xl bg-white/8 px-5 py-3 font-semibold disabled:opacity-50"
              >
                <RefreshCw className="h-4 w-4" /> Rebalance remaining
              </button>
              <label className="inline-flex items-center gap-2 rounded-2xl bg-white/8 px-4 py-3 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={freeDay}
                  onChange={(event) => {
                    const nextValue = event.target.checked;
                    setFreeDay(nextValue);
                    window.localStorage.setItem(
                      `free-day:${selectedProfileId}:${getTodayKey()}`,
                      String(nextValue)
                    );
                  }}
                />
                Free day
              </label>
            </div>
            {message && <p className="muted mt-3 text-sm">{message}</p>}
          </div>

          <div className="surface mb-4 rounded-3xl p-5">
            <button
              type="button"
              onClick={() => setShowManualAdd((current) => !current)}
              className="flex w-full items-center justify-between text-left"
            >
              <h2 className="text-xl font-semibold">Add food manually</h2>
              {showManualAdd ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </button>
            {showManualAdd && (
            <div className="mt-4 grid gap-3 md:grid-cols-[160px_1fr_120px_auto]">
              <select className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white" value={manualMealSlot} onChange={(event) => setManualMealSlot(event.target.value as MealSlot)}>
                {plannerSlots.map((slot) => <option key={slot.key} value={slot.key}>{slot.label}</option>)}
              </select>
              <div className="relative">
                <input className="w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-white" placeholder="Search food" value={foodSearch} onChange={(event) => { setFoodSearch(event.target.value); setManualFoodId(""); }} />
                {foodSearch && !manualFoodId && matchingFoods.length > 0 && (
                  <div className="surface absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl">
                    {matchingFoods.map((food) => (
                      <button key={food.id} onClick={() => { setManualFoodId(food.id); setFoodSearch(food.name); setManualAmount(food.serving_mode === "grams" ? Number(food.base_grams || 100) : 1); }} className="flex w-full justify-between px-4 py-3 text-left text-sm hover:bg-white/8">
                        <span>{food.name}</span><span className="muted">{food.serving_label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white" type="number" min="0" value={manualAmount} onChange={(event) => setManualAmount(Number(event.target.value))} />
              <button onClick={addManualFood} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white/8 px-4 py-3 font-semibold"><Plus className="h-4 w-4" />Add</button>
            </div>
            )}
          </div>

          <div className="space-y-4">
            {plannerSlots.map((slot) => {
              const meal = meals.find((candidate) => candidate.meal_slot === slot.key);
              const slotOptions = getSlotOptions(options, slot.key, rules);
              return (
                <div key={slot.key} className="surface rounded-3xl p-5">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setOpenMealSlot(slot.key)}
                      className="text-left"
                    >
                      <h2 className="text-xl font-semibold">{slot.label}</h2>
                      <p className="muted text-sm">{meal?.meal_name || "No meal selected yet."}</p>
                    </button>
                    {meal && (
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => shuffleMeal(slot.key)} className="inline-flex items-center gap-2 rounded-xl bg-white/6 px-3 py-2 text-sm"><Shuffle className="h-4 w-4" />Random swap</button>
                        <select className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" value={meal.meal_template_id || ""} onChange={(event) => { const option = slotOptions.find((candidate) => candidate.template.id === event.target.value); if (option) void replaceMealAndRebalance(slot.key, option); }}>
                          {slotOptions.map((option) => <option key={option.template.id} value={option.template.id}>{option.template.name}</option>)}
                        </select>
                        <label className="inline-flex items-center gap-2 rounded-xl bg-white/6 px-3 py-2 text-sm">
                          <input type="checkbox" checked={meal.completed} onChange={(event) => toggleCompleted(meal.id, event.target.checked)} />
                          <CheckCircle2 className="h-4 w-4" />Completed
                        </label>
                      </div>
                    )}
                  </div>

                  {openMealSlot === slot.key && meal?.items.length ? (
                    <div className="space-y-2">
                      {meal.items.map((item) => {
                        const food = foods.find((candidate) => candidate.id === item.food_id);
                        if (!food) return null;
                        const swapCandidates = foods.filter(
                          (candidate) =>
                            candidate.category === food.category &&
                            candidate.id !== food.id &&
                            candidate.is_available !== false &&
                            ["carb", "protein", "fat"].includes(food.category)
                        );
                        return (
                          <div key={item.id} className="surface-strong flex items-center justify-between gap-3 rounded-2xl p-3">
                            <div>
      <div className="font-medium">{food.name}</div>
      <div className="muted text-sm">
        {food.serving_mode === "grams"
          ? `${item.amount} g`
          : `${item.amount} × ${food.serving_label}`}
      </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {swapCandidates.length > 0 && (
                                <select
                                  className="max-w-40 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                                  defaultValue=""
                                  onChange={(event) => {
                                    if (event.target.value) void swapItemFood(item, event.target.value);
                                  }}
                                >
                                  <option value="">Swap {food.category}</option>
                                  {swapCandidates.map((candidate) => (
                                    <option key={candidate.id} value={candidate.id}>
                                      {candidate.name}
                                    </option>
                                  ))}
                                </select>
                              )}
                              <input className="w-24 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white" type="number" min="0" step={food.serving_mode === "grams" ? "5" : "0.25"} value={item.amount} onChange={(event) => updateItemAmount(item.id, Number(event.target.value))} />
                              <button onClick={() => removeItem(item.id)} className="rounded-xl bg-white/6 p-2"><Trash2 className="h-4 w-4" /></button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : openMealSlot === slot.key ? (
                    <p className="muted text-sm">Generate a plan to fill this meal.</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        <aside className="hidden space-y-4 lg:block">
          <MacroSummary
            totals={totals}
            targets={{
              calories: selectedProfile?.calorie_target || 0,
              protein: selectedProfile?.protein_target || 0,
              carbs: selectedProfile?.carbs_target || 0,
              fat: selectedProfile?.fat_target || 0,
            }}
          />
        </aside>
      </div>
    </main>
  );
}

function exceedsTargets(totals: ReturnType<typeof calculateDailyTotals>, profile: Profile) {
  return (
    totals.calories > profile.calorie_target ||
    totals.protein > profile.protein_target ||
    totals.carbs > profile.carbs_target ||
    totals.fat > profile.fat_target
  );
}
