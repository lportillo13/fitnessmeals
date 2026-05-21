"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, CheckCircle2, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Plus, RefreshCw, Save, Shuffle, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  buildPlanningOptions,
  buildTemplateOptions,
  chooseOptimizedDayPlan,
  getSlotOptions,
  planRemainingMealsByBudget,
  pickAlternative,
  plannerSlots,
  type TemplateOption,
} from "@/lib/mealPlanner";
import { calculateDailyTotals, calculateFoodMacros, inferAmountMode, roundMacros } from "@/lib/macroCalculator";
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
import MotivationModal, { type MotivationTone } from "@/components/MotivationModal";
import { instantMotivation } from "@/lib/motivation";

type PlannedMeal = DailyPlanMeal & {
  items: DailyPlanItem[];
};

function getTodayKey() {
  return new Date().toLocaleDateString("en-CA");
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return new Date(value);
  return new Date(year, month - 1, day);
}

function formatDateKey(date: Date) {
  return date.toLocaleDateString("en-CA");
}

function addDays(date: Date, dayOffset: number) {
  const nextDate = new Date(date);
  nextDate.setDate(date.getDate() + dayOffset);
  return nextDate;
}

function formatPlanDateLabel(value: string) {
  return parseDateKey(value).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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
  const [selectedPlanDate, setSelectedPlanDate] = useState(getTodayKey);
  const [checkedSelectedPlan, setCheckedSelectedPlan] = useState(false);
  const [message, setMessage] = useState("");
  const [foodSearch, setFoodSearch] = useState("");
  const [manualFoodId, setManualFoodId] = useState("");
  const [manualMealSlot, setManualMealSlot] = useState<MealSlot>("breakfast");
  const [manualAmount, setManualAmount] = useState(1);
  const [manualAmountMode, setManualAmountMode] = useState<"serving" | "grams">("grams");
  const [displayAmountMode, setDisplayAmountMode] = useState<"serving" | "grams">("grams");
  const [openMealSlot, setOpenMealSlot] = useState<MealSlot | null>("breakfast");
  const [freeDay, setFreeDay] = useState(false);
  const [noRecalculate, setNoRecalculate] = useState(false);
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [saveMealDraft, setSaveMealDraft] = useState<{ meal: PlannedMeal; name: string } | null>(null);
  const [motivation, setMotivation] = useState<{ message: string; tone: MotivationTone } | null>(null);
  const todayKey = getTodayKey();
  const isViewingToday = selectedPlanDate === todayKey;
  const selectedPlanDateLabel = formatPlanDateLabel(selectedPlanDate);
  const visibleFoods = useMemo(
    () =>
      foods.filter(
        (food) => food.profile_id == null || !selectedProfileId || food.profile_id === selectedProfileId
      ),
    [foods, selectedProfileId]
  );

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
        window.localStorage.getItem(`free-day:${selectedProfileId}:${selectedPlanDate}`) === "true"
      );
      setNoRecalculate(
        window.localStorage.getItem(`no-recalculate:${selectedProfileId}:${selectedPlanDate}`) === "true"
      );
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [selectedProfileId, selectedPlanDate]);

  useEffect(() => {
    async function loadSelectedPlan() {
      if (!selectedProfileId) return;
      setCheckedSelectedPlan(false);
      setPlan(null);
      setMeals([]);
      setMessage("");
      const supabase = createClient();
      const { data: planData } = await supabase
        .from("daily_plans")
        .select("*")
        .eq("profile_id", selectedProfileId)
        .eq("plan_date", selectedPlanDate)
        .maybeSingle();

      if (!planData) {
        setCheckedSelectedPlan(true);
        return;
      }
      setPlan(planData as DailyPlan);

      const { data: mealData } = await supabase
        .from("daily_plan_meals")
        .select("*")
        .eq("daily_plan_id", planData.id)
        .order("meal_slot");
      const loadedMeals = (mealData || []) as DailyPlanMeal[];
      const { data: itemData } =
        loadedMeals.length > 0
          ? await supabase
              .from("daily_plan_items")
              .select("*")
              .in(
                "daily_plan_meal_id",
                loadedMeals.map((meal) => meal.id)
              )
          : { data: [] };
      setMeals(
        loadedMeals.map((meal) => ({
          ...meal,
          items: ((itemData || []) as DailyPlanItem[])
            .filter((item) => item.daily_plan_meal_id === meal.id)
            .map((item) => ({ ...item, completed: item.completed || meal.completed })),
        }))
      );
      const firstIncomplete =
        plannerSlots.find((slot) =>
          loadedMeals.some((meal) => meal.meal_slot === slot.key && !meal.completed)
        )?.key || "breakfast";
      setOpenMealSlot(firstIncomplete);
      setCheckedSelectedPlan(true);
    }

    loadSelectedPlan();
  }, [selectedProfileId, selectedPlanDate]);

  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId);
  const options = useMemo(
    () =>
      selectedProfile
        ? buildPlanningOptions(selectedProfile, templates, templateItems, visibleFoods, rules)
        : [],
    [selectedProfile, templates, templateItems, visibleFoods, rules]
  );
  const savedOptions = useMemo(
    () => buildTemplateOptions(templates, templateItems, visibleFoods),
    [templates, templateItems, visibleFoods]
  );
  const selectedFoods = useMemo<SelectedFood[]>(
    () =>
      meals.flatMap((meal) =>
        meal.items.flatMap((item) => {
          if (!item.completed) return [];
          const food = visibleFoods.find((candidate) => candidate.id === item.food_id);
          return food
            ? [
                {
                  food,
                  amount: Number(item.amount),
                  amountMode: inferAmountMode(food, Number(item.amount), item.amount_mode),
                  mealSlot: meal.meal_slot,
                },
              ]
            : [];
        })
      ),
    [meals, visibleFoods]
  );
  const totals = roundMacros(calculateDailyTotals(selectedFoods));
  const matchingFoods = visibleFoods
    .filter((food) =>
      `${food.name} ${food.brand || ""}`.toLowerCase().includes(foodSearch.toLowerCase())
    )
    .slice(0, 8);
  const manualFood = visibleFoods.find((food) => food.id === manualFoodId);
  const canUseManualGrams = canUseGrams(manualFood);

  const generatePlan = useCallback(async () => {
    if (!selectedProfile) return;
    const chosen = chooseOptimizedDayPlan(selectedProfile, options, rules, visibleFoods);
    if (chosen.some((entry) => !entry.selected)) {
      setMessage("Add available foods with protein and carbs, or save a meal for each empty slot.");
      return;
    }

    const supabase = createClient();
    let activePlan = plan;
    if (activePlan) {
      await supabase.from("daily_plan_meals").delete().eq("daily_plan_id", activePlan.id);
    } else {
      const { data: createdPlan, error } = await supabase
        .from("daily_plans")
        .insert({ profile_id: selectedProfile.id, plan_date: selectedPlanDate })
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
      no_rebalance: entry.selected!.template.no_rebalance || false,
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
        amount_mode: item.amount_mode,
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
    setMessage(`${selectedPlanDateLabel} meal plan is ready.`);
  }, [selectedProfile, options, rules, visibleFoods, plan, selectedPlanDate, selectedPlanDateLabel]);

  useEffect(() => {
    if (
      !selectedProfile ||
      !checkedSelectedPlan ||
      !isViewingToday ||
      plan ||
      options.length === 0
    ) return;
    const timeoutId = window.setTimeout(() => {
      void generatePlan();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [selectedProfile, checkedSelectedPlan, isViewingToday, plan, options.length, generatePlan]);

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
        no_rebalance: option.template.no_rebalance || false,
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
          amount_mode: item.amount_mode,
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
            meal_template_id: option.template.id.startsWith("synthetic-") ? null : option.template.id,
            meal_name: option.template.name,
            completed: false,
            no_rebalance: option.template.no_rebalance || false,
            items: option.items.map((item) => ({
              id: item.id,
              daily_plan_meal_id: meal.id,
              food_id: item.food_id,
              amount: item.amount,
              amount_mode: item.amount_mode,
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

  async function updateItemAmount(
    itemId: string,
    amount: number,
    amountMode?: "serving" | "grams"
  ) {
    await createClient()
      .from("daily_plan_items")
      .update(amountMode ? { amount, amount_mode: amountMode } : { amount })
      .eq("id", itemId);
    const nextMeals = meals.map((meal) => ({
        ...meal,
        items: meal.items.map((item) =>
          item.id === itemId
            ? { ...item, amount, amount_mode: amountMode || item.amount_mode }
            : item
        ),
      }));
    setMeals(nextMeals);

    const changedMeal = nextMeals.find((meal) =>
      meal.items.some((item) => item.id === itemId)
    );
    if (!changedMeal || !selectedProfile) return;

    const changedIndex = plannerSlots.findIndex((slot) => slot.key === changedMeal.meal_slot);
    if (!freeDay && !noRecalculate) await rebalanceFutureMeals(nextMeals, changedIndex);
  }

  async function updateItemAmountMode(itemId: string, amountMode: "serving" | "grams") {
    const changedMeal = meals.find((meal) =>
      meal.items.some((item) => item.id === itemId)
    );
    const changedItem = changedMeal?.items.find((item) => item.id === itemId);
    if (!changedMeal || !changedItem) return;

    const food = visibleFoods.find((candidate) => candidate.id === changedItem.food_id);
    if (!food) return;
    if (amountMode === "grams" && !canUseGrams(food)) {
      setMessage("This food does not have a gram weight saved yet, so it can only use servings.");
      return;
    }
    const currentAmount = Number(changedItem.amount);
    const currentAmountMode = inferAmountMode(food, currentAmount, changedItem.amount_mode);
    const nextAmount = convertAmountMode(food, currentAmount, currentAmountMode, amountMode);

    setDisplayAmountMode(amountMode);
    await createClient()
      .from("daily_plan_items")
      .update({ amount_mode: amountMode, amount: nextAmount })
      .eq("id", itemId);

    const nextMeals = meals.map((meal) => ({
      ...meal,
      items: meal.items.map((item) =>
        item.id === itemId ? { ...item, amount_mode: amountMode, amount: nextAmount } : item
      ),
    }));
    setMeals(nextMeals);

    const changedIndex = plannerSlots.findIndex((slot) => slot.key === changedMeal.meal_slot);
    if (!freeDay && !noRecalculate) await rebalanceFutureMeals(nextMeals, changedIndex);
  }

  function formatItemAmount(item: DailyPlanItem, food: Food) {
    const displayAmount = getDisplayItemAmount(item, food, displayAmountMode);
    return displayAmount.amountMode === "grams"
      ? `${roundQuantity(displayAmount.amount)} g`
      : `${roundQuantity(displayAmount.amount)} x ${food.serving_label}`;
  }

  function getDisplayItemAmount(
    item: DailyPlanItem,
    food: Food,
    requestedMode: "serving" | "grams"
  ) {
    const amountMode = inferAmountMode(food, Number(item.amount), item.amount_mode);
    const amount = Number(item.amount);

    if (requestedMode === "grams") {
      const grams =
        amountMode === "grams"
          ? amount
          : food.base_grams
            ? amount * Number(food.base_grams)
            : null;

      if (grams != null) {
        return { amount: roundQuantityNumber(grams), amountMode: "grams" as const };
      }
    }

    const servings =
      amountMode === "serving"
        ? amount
        : food.base_grams
          ? amount / Number(food.base_grams)
          : null;

    if (servings != null) {
      return { amount: roundQuantityNumber(servings), amountMode: "serving" as const };
    }

    return { amount: roundQuantityNumber(amount), amountMode };
  }

  async function toggleItemCompleted(itemId: string, completed: boolean) {
    const supabase = createClient();
    await supabase.from("daily_plan_items").update({ completed }).eq("id", itemId);
    let nextMeals = meals.map((meal) => ({
      ...meal,
      items: meal.items.map((item) => (item.id === itemId ? { ...item, completed } : item)),
    }));
    const changedMeal = nextMeals.find((meal) => meal.items.some((item) => item.id === itemId));
    const mealCompleted =
      Boolean(changedMeal?.items.length) &&
      Boolean(changedMeal?.items.every((item) => item.completed));

    if (changedMeal && changedMeal.completed !== mealCompleted) {
      await supabase.from("daily_plan_meals").update({ completed: mealCompleted }).eq("id", changedMeal.id);
      nextMeals = nextMeals.map((meal) =>
        meal.id === changedMeal.id ? { ...meal, completed: mealCompleted } : meal
      );
    }
    setMeals(nextMeals);
    if (completed) {
      setMotivation({ message: instantMotivation("meal_completed"), tone: "positive" });
    }
  }

  async function rebalanceFutureMeals(sourceMeals: PlannedMeal[], changedIndex: number) {
    if (!selectedProfile) return;
    if (freeDay || noRecalculate) {
      setMessage(
        freeDay
          ? "Free day is on, so automatic recalculation is paused."
          : "No recalculate is on, so future meals stay unchanged."
      );
      return;
    }
    const futureMeals = sourceMeals.filter(
      (meal) =>
        plannerSlots.findIndex((slot) => slot.key === meal.meal_slot) > changedIndex &&
        !meal.completed &&
        !meal.no_rebalance
    );
    const lockedMeals = sourceMeals.filter(
      (meal) =>
        plannerSlots.findIndex((slot) => slot.key === meal.meal_slot) <= changedIndex ||
        meal.completed ||
        meal.no_rebalance
    );
    const lockedFoods = lockedMeals.flatMap((meal) =>
      meal.items.flatMap((item) => {
          const food = visibleFoods.find((candidate) => candidate.id === item.food_id);
          return food
            ? [
                {
                  food,
                  amount: Number(item.amount),
                  amountMode: inferAmountMode(food, Number(item.amount), item.amount_mode),
                  mealSlot: meal.meal_slot,
                },
              ]
            : [];
        })
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
      visibleFoods,
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
    const supabase = createClient();
    await supabase.from("daily_plan_meals").update({ completed }).eq("id", mealId);
    await supabase.from("daily_plan_items").update({ completed }).eq("daily_plan_meal_id", mealId);
    const nextMeals = meals.map((meal) =>
      meal.id === mealId
        ? {
            ...meal,
            completed,
            items: meal.items.map((item) => ({ ...item, completed })),
          }
        : meal
    );
    setMeals(nextMeals);
    if (completed) {
      const completedMeal = nextMeals.find((meal) => meal.id === mealId);
      const completedIndex = completedMeal
        ? plannerSlots.findIndex((slot) => slot.key === completedMeal.meal_slot)
        : -1;
      if (completedIndex >= 0 && !freeDay && !noRecalculate) {
        await rebalanceFutureMeals(nextMeals, completedIndex);
      }
      const nextIncomplete = plannerSlots.find((slot) =>
        nextMeals.some((meal) => meal.meal_slot === slot.key && !meal.completed)
      );
      if (nextIncomplete) setOpenMealSlot(nextIncomplete.key);
      const allCompleted =
        nextMeals.length > 0 &&
        plannerSlots.every((slot) =>
          nextMeals.some((meal) => meal.meal_slot === slot.key && meal.completed)
        );
      setMotivation({
        message: instantMotivation(allCompleted ? "day_completed" : "meal_completed"),
        tone: "positive",
      });
    }
  }

  async function addManualFood() {
    if (!manualFoodId || !selectedProfile) return;
    const selectedManualFood = visibleFoods.find((food) => food.id === manualFoodId);
    const safeManualAmountMode =
      manualAmountMode === "grams" && !canUseGrams(selectedManualFood) ? "serving" : manualAmountMode;
    const supabase = createClient();
    let activePlan = plan;
    if (!activePlan) {
      const { data: createdPlan, error } = await supabase
        .from("daily_plans")
        .insert({ profile_id: selectedProfile.id, plan_date: selectedPlanDate })
        .select("*")
        .single();
      if (error) {
        setMessage(error.message);
        return;
      }
      activePlan = createdPlan as DailyPlan;
      setPlan(activePlan);
    }

    let meal = meals.find((candidate) => candidate.meal_slot === manualMealSlot);
    if (!meal) {
      const { data: createdMeal, error } = await supabase
        .from("daily_plan_meals")
        .insert({
          daily_plan_id: activePlan.id,
          meal_slot: manualMealSlot,
          meal_template_id: null,
          meal_name: "Manual meal",
          completed: true,
          no_rebalance: true,
        })
        .select("*")
        .single();
      if (error) {
        setMessage(error.message);
        return;
      }
      meal = { ...(createdMeal as DailyPlanMeal), items: [] };
    }

    const { data } = await supabase
      .from("daily_plan_items")
      .insert({
        daily_plan_meal_id: meal.id,
        food_id: manualFoodId,
        amount: manualAmount,
        amount_mode: safeManualAmountMode,
        completed: true,
      })
      .select("*")
      .single();
    const hasExistingMeal = meals.some((entry) => entry.id === meal.id);
    const nextMeals = hasExistingMeal
      ? meals.map((entry) =>
          entry.id === meal.id ? { ...entry, items: [...entry.items, data as DailyPlanItem] } : entry
        )
      : [...meals, { ...meal, items: [data as DailyPlanItem] }];
    setMeals(nextMeals);
    setFoodSearch("");
    setManualFoodId("");
    setManualAmountMode("grams");
    if (!freeDay && !noRecalculate) {
      const changedIndex = plannerSlots.findIndex((slot) => slot.key === meal!.meal_slot);
      await rebalanceFutureMeals(nextMeals, changedIndex);
    }
  }

  async function savePlannedMealAsTemplate(meal: PlannedMeal, mealName = meal.meal_name) {
    if (!selectedProfile) return;
    if (meal.items.length === 0) {
      setMessage("Add at least one food before saving this meal.");
      return;
    }
    const trimmedMealName = mealName.trim();
    if (!trimmedMealName) {
      setMessage("Add a meal name before saving this meal.");
      return;
    }

    const supabase = createClient();
    const { data: template, error } = await supabase
      .from("meal_templates")
      .insert({
        profile_id: selectedProfile.id,
        name: trimmedMealName,
        meal_slot: meal.meal_slot,
      })
      .select("*")
      .single();

    if (error) {
      setMessage(error.message);
      return;
    }

    const rows = meal.items.map((item) => {
      const food = visibleFoods.find((candidate) => candidate.id === item.food_id);
      return {
        meal_template_id: template.id,
        food_id: item.food_id,
        amount: Number(item.amount),
        amount_mode: food ? inferAmountMode(food, Number(item.amount), item.amount_mode) : item.amount_mode,
      };
    });
    const { data: createdItems, error: itemError } = await supabase
      .from("meal_template_items")
      .insert(rows)
      .select("*");

    if (itemError) {
      setMessage(itemError.message);
      return;
    }

    setTemplates((current) => [...current, template as MealTemplate]);
    setTemplateItems((current) => [...current, ...((createdItems || []) as MealTemplateItem[])]);
    setMessage(`${trimmedMealName} saved to your meal library.`);
  }

  async function confirmSaveMealAsTemplate() {
    if (!saveMealDraft) return;
    if (!saveMealDraft.name.trim()) {
      setMessage("Add a meal name before saving this meal.");
      return;
    }
    await savePlannedMealAsTemplate(saveMealDraft.meal, saveMealDraft.name);
    setSaveMealDraft(null);
  }

  async function removeItem(itemId: string) {
    await createClient().from("daily_plan_items").delete().eq("id", itemId);
    const nextMeals = meals.map((meal) => ({ ...meal, items: meal.items.filter((item) => item.id !== itemId) }));
    setMeals(nextMeals);
    const changedMeal = meals.find((meal) => meal.items.some((item) => item.id === itemId));
    if (changedMeal && !freeDay && !noRecalculate) {
      const changedIndex = plannerSlots.findIndex((slot) => slot.key === changedMeal.meal_slot);
      await rebalanceFutureMeals(nextMeals, changedIndex);
    }
  }

  async function swapItemFood(item: DailyPlanItem, replacementFoodId: string) {
    const meal = meals.find((entry) => entry.items.some((candidate) => candidate.id === item.id));
    const currentFood = visibleFoods.find((food) => food.id === item.food_id);
    const replacementFood = visibleFoods.find((food) => food.id === replacementFoodId);
    if (!meal || !currentFood || !replacementFood) return;
    if (!["carb", "protein", "fat"].includes(currentFood.category)) return;

    const macroKey =
      currentFood.category === "protein"
        ? "protein"
        : currentFood.category === "carb"
          ? "carbs"
          : "fat";
    const currentAmountMode = inferAmountMode(currentFood, Number(item.amount), item.amount_mode);
    const currentMacroAmount = calculateFoodMacros(
      currentFood,
      Number(item.amount),
      currentAmountMode
    )[macroKey];
    const replacementBaseAmount =
      replacementFood.serving_mode === "grams" ? Number(replacementFood.base_grams || 100) : 1;
    const replacementAmountMode: "serving" | "grams" =
      replacementFood.serving_mode === "grams" ? "grams" : "serving";
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
      .update({ food_id: replacementFood.id, amount: nextAmount, amount_mode: replacementAmountMode })
      .eq("id", item.id);

    const nextMeals = meals.map((entry) => ({
      ...entry,
      items: entry.items.map((candidate) =>
        candidate.id === item.id
          ? { ...candidate, food_id: replacementFood.id, amount: nextAmount, amount_mode: replacementAmountMode }
          : candidate
      ),
    }));
    setMeals(nextMeals);
    const changedIndex = plannerSlots.findIndex((slot) => slot.key === meal.meal_slot);
    if (!freeDay && !noRecalculate) await rebalanceFutureMeals(nextMeals, changedIndex);
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
        no_rebalance: template.no_rebalance || false,
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
          amount_mode: item.amount_mode,
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

  function moveSelectedPlanDate(dayOffset: number) {
    setSelectedPlanDate((currentDate) => {
      const nextDate = addDays(parseDateKey(currentDate), dayOffset);
      const today = parseDateKey(todayKey);
      if (nextDate > today) return todayKey;
      return formatDateKey(nextDate);
    });
  }

  return (
    <main className="app-shell">
      <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[1fr_380px]">
        <section className="min-w-0">
          <div className="mb-4 min-w-0 max-w-full lg:hidden">
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
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-4xl font-bold">Meal Plan</h1>
              <p className="muted mt-1 text-sm">{selectedPlanDateLabel}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => moveSelectedPlanDate(-1)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white/8"
                aria-label="Previous day"
                title="Previous day"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <input
                className="h-11 rounded-xl border border-white/10 bg-white/5 px-3 text-white"
                type="date"
                value={selectedPlanDate}
                max={todayKey}
                onChange={(event) => {
                  if (!event.target.value) return;
                  setSelectedPlanDate(
                    parseDateKey(event.target.value) > parseDateKey(todayKey)
                      ? todayKey
                      : event.target.value
                  );
                }}
                aria-label="Meal plan date"
              />
              <button
                type="button"
                onClick={() => moveSelectedPlanDate(1)}
                disabled={isViewingToday}
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white/8 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Next day"
                title="Next day"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              {!isViewingToday && (
                <button
                  type="button"
                  onClick={() => setSelectedPlanDate(todayKey)}
                  className="h-11 rounded-xl bg-white/8 px-4 text-sm font-semibold"
                >
                  Today
                </button>
              )}
            </div>
          </div>

          <div className="surface relative z-40 mb-4 rounded-3xl p-5">
            <div className="flex flex-wrap gap-3">
              {!plan && (
                <button onClick={generatePlan} className="inline-flex items-center gap-2 rounded-2xl bg-lime-300 px-5 py-3 font-semibold text-black">
                  <RefreshCw className="h-4 w-4" /> Create meal plan
                </button>
              )}
              <div className="inline-flex rounded-2xl bg-white/8 p-1 text-sm font-semibold">
                <button
                  type="button"
                  onClick={() => setDisplayAmountMode("serving")}
                  className={`rounded-xl px-4 py-2 ${displayAmountMode === "serving" ? "bg-lime-300 text-black" : "text-white"}`}
                >
                  Servings
                </button>
                <button
                  type="button"
                  onClick={() => setDisplayAmountMode("grams")}
                  className={`rounded-xl px-4 py-2 ${displayAmountMode === "grams" ? "bg-lime-300 text-black" : "text-white"}`}
                >
                  Grams
                </button>
              </div>
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
            <div className="mt-4 grid gap-3 md:grid-cols-[160px_1fr_120px_120px_auto]">
              <select className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white" value={manualMealSlot} onChange={(event) => setManualMealSlot(event.target.value as MealSlot)}>
                {plannerSlots.map((slot) => <option key={slot.key} value={slot.key}>{slot.label}</option>)}
              </select>
              <div className="relative">
                <input className="w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-white" placeholder="Search food" value={foodSearch} onChange={(event) => { setFoodSearch(event.target.value); setManualFoodId(""); }} />
                {foodSearch && !manualFoodId && matchingFoods.length > 0 && (
                  <div className="surface absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl shadow-2xl">
                    {matchingFoods.map((food) => (
                      <button key={food.id} onClick={() => { const defaultAmount = getDefaultFoodAmount(food); setManualFoodId(food.id); setFoodSearch(food.name); setManualAmountMode(defaultAmount.amountMode); setManualAmount(defaultAmount.amount); }} className="flex w-full justify-between px-4 py-3 text-left text-sm hover:bg-white/8">
                        <span>{food.name}</span><span className="muted">{food.serving_label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_120px] md:contents">
                <input
                  className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
                  type="number"
                  min="0"
                  step={manualAmountMode === "grams" ? "5" : "0.25"}
                  value={manualAmount}
                  onChange={(event) => setManualAmount(Number(event.target.value))}
                />
                <select
                  className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
                  value={manualAmountMode}
                  onChange={(event) => {
                    const nextMode = event.target.value as "serving" | "grams";
                    if (nextMode === "grams" && !canUseManualGrams) return;
                    const currentMode = manualAmountMode;
                    setManualAmountMode(nextMode);
                    if (!manualFood) return;
                    setManualAmount(convertAmountMode(manualFood, manualAmount, currentMode, nextMode));
                  }}
                >
                  <option value="serving">Serving</option>
                  <option value="grams" disabled={Boolean(manualFood) && !canUseManualGrams}>Grams</option>
                </select>
              </div>
              <button onClick={addManualFood} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white/8 px-4 py-3 font-semibold"><Plus className="h-4 w-4" />Add</button>
            </div>
            )}
          </div>

          <div className="space-y-4">
            {plannerSlots.map((slot) => {
              const meal = meals.find((candidate) => candidate.meal_slot === slot.key);
              const slotOptions = getSlotOptions(savedOptions, slot.key, rules);
              const selectedOptionValue = meal?.meal_template_id || "";
              const savedMealName = meal?.meal_template_id ? meal.meal_name : "";
              return (
                <div key={slot.key} className="surface rounded-3xl p-5">
                  <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenMealSlot((current) => (current === slot.key ? null : slot.key))
                      }
                      className="min-w-0 text-left"
                    >
                      <h2 className="text-xl font-semibold">{slot.label}</h2>
                      <p className="muted max-w-full break-words text-sm">{savedMealName || "No saved meal selected yet."}</p>
                    </button>
                    {meal && (
                      <div className="grid min-w-0 w-full grid-cols-[44px_44px_minmax(0,1fr)] gap-2 md:grid-cols-[44px_44px_minmax(16rem,1fr)_auto]">
                        <button
                          type="button"
                          onClick={() => shuffleMeal(slot.key)}
                          className="inline-flex h-11 w-11 min-w-0 items-center justify-center rounded-xl bg-white/6 text-sm"
                          aria-label={`Random swap ${slot.label}`}
                          title="Random swap"
                        >
                          <Shuffle className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setSaveMealDraft({ meal, name: savedMealName })}
                          className="inline-flex h-11 w-11 min-w-0 items-center justify-center rounded-xl bg-white/6 text-sm"
                          aria-label={`Save ${slot.label} meal`}
                          title="Save meal"
                        >
                          <Save className="h-4 w-4" />
                        </button>
                        <MealOptionSelect
                          value={selectedOptionValue}
                          options={slotOptions}
                          onChange={(value) => {
                            const option = slotOptions.find((candidate) => candidate.template.id === value);
                            if (option) void replaceMealAndRebalance(slot.key, option);
                          }}
                        />
                        <label className="col-span-3 inline-flex items-center gap-2 rounded-xl bg-white/6 px-3 py-2 text-sm md:col-span-1">
                          <input type="checkbox" checked={meal.completed} onChange={(event) => toggleCompleted(meal.id, event.target.checked)} />
                          <CheckCircle2 className="h-4 w-4" />Completed
                        </label>
                      </div>
                    )}
                  </div>

                  {openMealSlot === slot.key && meal?.items.length ? (
                    <div className="space-y-2">
                      {meal.items.map((item) => {
              const food = visibleFoods.find((candidate) => candidate.id === item.food_id);
                        if (!food) return null;
              const displayAmount = getDisplayItemAmount(item, food, displayAmountMode);
              const swapCandidates = visibleFoods.filter(
                          (candidate) =>
                            candidate.category === food.category &&
                            candidate.id !== food.id &&
                            candidate.is_available !== false &&
                            ["carb", "protein", "fat"].includes(food.category)
                        );
                        return (
                          <div key={item.id} className="surface-strong grid grid-cols-[40px_minmax(72px,1fr)_minmax(108px,1fr)_40px] gap-3 rounded-2xl p-3 lg:grid-cols-[minmax(210px,1fr)_40px_86px_96px_40px] lg:items-center">
                            <div className="col-span-4 flex min-w-0 items-start gap-3 lg:col-span-1">
                              <input
                                className="mt-1 shrink-0"
                                type="checkbox"
                                checked={Boolean(item.completed)}
                                onChange={(event) => toggleItemCompleted(item.id, event.target.checked)}
                              />
                              <div className="min-w-0">
                                <div className="whitespace-normal break-words font-medium leading-snug">
                                  {food.name}
                                </div>
                                <div className="muted text-sm">{formatItemAmount(item, food)}</div>
                              </div>
                            </div>
                            {swapCandidates.length > 0 ? (
                              <ItemSwapSelect
                                category={food.category}
                                candidates={swapCandidates}
                                onChange={(foodId) => swapItemFood(item, foodId)}
                              />
                            ) : (
                              <div className="h-10 w-10" />
                            )}
                            <input className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white" type="number" min="0" step={displayAmount.amountMode === "grams" ? "5" : "0.25"} value={displayAmount.amount} onChange={(event) => updateItemAmount(item.id, Number(event.target.value), displayAmount.amountMode)} />
                            <select
                              className="w-full rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-sm text-white"
                              value={displayAmount.amountMode}
                              onChange={(event) =>
                                updateItemAmountMode(item.id, event.target.value as "serving" | "grams")
                              }
                            >
                              <option value="grams" disabled={!food.base_grams}>Grams</option>
                              <option value="serving">Serving</option>
                            </select>
                            <button onClick={() => removeItem(item.id)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/6"><Trash2 className="h-4 w-4" /></button>
                          </div>
                        );
                      })}
                    </div>
                  ) : openMealSlot === slot.key ? (
                    <p className="muted text-sm">No foods added yet.</p>
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
      {motivation && (
        <MotivationModal
          message={motivation.message}
          tone={motivation.tone}
          onClose={() => setMotivation(null)}
        />
      )}
      {saveMealDraft && (
        <SaveMealModal
          name={saveMealDraft.name}
          onNameChange={(name) =>
            setSaveMealDraft((current) => (current ? { ...current, name } : current))
          }
          onCancel={() => setSaveMealDraft(null)}
          onSave={() => void confirmSaveMealAsTemplate()}
        />
      )}
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

function roundQuantity(value: number) {
  return Number(value.toFixed(2)).toString();
}

function roundQuantityNumber(value: number) {
  return Number(value.toFixed(2));
}

function canUseGrams(food?: Pick<Food, "base_grams"> | null) {
  return Number(food?.base_grams || 0) > 0;
}

function getDefaultFoodAmount(food: Food) {
  if (canUseGrams(food)) {
    return { amount: Number(food.base_grams), amountMode: "grams" as const };
  }

  return { amount: 1, amountMode: "serving" as const };
}

function convertAmountMode(
  food: Pick<Food, "base_grams">,
  amount: number,
  currentMode: "serving" | "grams",
  nextMode: "serving" | "grams"
) {
  if (currentMode === nextMode) return roundQuantityNumber(amount);
  const baseGrams = Number(food.base_grams || 0);
  if (baseGrams <= 0) return roundQuantityNumber(amount);

  return roundQuantityNumber(nextMode === "grams" ? amount * baseGrams : amount / baseGrams);
}

function ItemSwapSelect({
  category,
  candidates,
  onChange,
}: {
  category: Food["category"];
  candidates: Food[];
  onChange: (foodId: string) => void;
}) {
  return (
    <label className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/6">
      <ArrowLeftRight className="h-4 w-4" />
      <select
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        defaultValue=""
        onChange={(event) => {
          if (event.target.value) onChange(event.target.value);
          event.target.value = "";
        }}
        aria-label={`Swap ${category}`}
        title={`Swap ${category}`}
      >
        <option value="" disabled>
          Swap {category}
        </option>
        {candidates.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function SaveMealModal({
  name,
  onNameChange,
  onCancel,
  onSave,
}: {
  name: string;
  onNameChange: (name: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <form
        className="surface w-full max-w-md rounded-3xl p-6"
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <h2 className="text-2xl font-bold">Save meal</h2>
        <label className="mt-4 block">
          <span className="text-sm font-medium">Meal name</span>
          <input
            className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            autoFocus
          />
        </label>
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-2xl bg-white/8 px-5 py-3 font-semibold"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-2xl bg-lime-300 px-5 py-3 font-semibold text-black"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

function MealOptionSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: TemplateOption[];
  onChange: (value: string) => void;
}) {
  const selected = options.find((option) => option.template.id === value);

  return (
    <label className="relative block min-w-0 w-full">
      <span className="pointer-events-none flex min-h-11 items-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 pr-9 text-sm text-white">
        <span className="line-clamp-2 break-words">{selected?.template.name || "Choose meal"}</span>
      </span>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" />
      <select
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Choose meal"
      >
        <option value="" disabled>
          {options.length > 0 ? "Choose saved meal" : "No saved meals"}
        </option>
        {options.map((option) => (
          <option key={option.template.id} value={option.template.id}>
            {option.template.name}
          </option>
        ))}
      </select>
    </label>
  );
}
