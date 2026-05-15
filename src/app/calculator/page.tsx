"use client";

import { useEffect, useMemo, useState } from "react";
import { Apple, Dumbbell, Plus, Save, TimerReset, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Food, MealSlot, MealTemplate, MealTemplateItem, Profile, SelectedFood } from "@/lib/types";
import { calculateDailyTotals, roundMacros } from "@/lib/macroCalculator";
import MacroSummary from "@/components/MacroSummary";

const mealSlots: { key: MealSlot; label: string }[] = [
  { key: "breakfast", label: "Breakfast" },
  { key: "snack_1", label: "Snack 1" },
  { key: "lunch", label: "Lunch" },
  { key: "snack_2", label: "Snack 2" },
  { key: "dinner", label: "Dinner" },
];

const targets = {
  calories: 1500,
  protein: 130,
  carbs: 135,
  fat: 45,
};

type StoredFoodSelection = {
  foodId: string;
  amount: number;
  mealSlot: MealSlot;
};

type DailyMealRow = {
  food_id: string;
  amount: number;
  meal_slot: MealSlot;
};

type DailyLogRow = {
  has_cardio: boolean;
  has_chocolate: boolean;
};

function getTodayKey() {
  return new Date().toLocaleDateString("en-CA");
}

function getStorageKey() {
  return `meal-calculator:${getTodayKey()}`;
}

export default function CalculatorPage() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [selectedFoods, setSelectedFoods] = useState<SelectedFood[]>([]);
  const [activeMeal, setActiveMeal] = useState<MealSlot>("breakfast");
  const [selectedFoodId, setSelectedFoodId] = useState("");
  const [foodSearch, setFoodSearch] = useState("");
  const [amount, setAmount] = useState(1);
  const [hasCardio, setHasCardio] = useState(false);
  const [hasChocolate, setHasChocolate] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [mealTemplates, setMealTemplates] = useState<MealTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [hasLoadedDatabaseMeals, setHasLoadedDatabaseMeals] = useState(false);

  useEffect(() => {
    async function loadFoods() {
      const supabase = createClient();

      const { data, error } = await supabase
        .from("foods")
        .select("*")
        .order("name");

      if (error) {
        console.error(error);
        return;
      }

      setFoods((data || []) as Food[]);
    }

    loadFoods();
  }, []);

  useEffect(() => {
    async function loadTemplates() {
      if (!selectedProfileId) return;

      const { data, error } = await createClient()
        .from("meal_templates")
        .select("*")
        .or(`profile_id.eq.${selectedProfileId},profile_id.is.null`)
        .order("name");

      if (error) {
        setSaveMessage(error.message);
        return;
      }

      setMealTemplates((data || []) as MealTemplate[]);
    }

    loadTemplates();
  }, [selectedProfileId]);

  useEffect(() => {
    async function loadProfiles() {
      const { data, error } = await createClient().from("meal_profiles").select("*").order("name");
      if (error) {
        setSaveMessage(error.message);
        return;
      }

      const loadedProfiles = (data || []) as Profile[];
      setProfiles(loadedProfiles);

      const rememberedProfileId = window.localStorage.getItem("selected-profile-id");
      const nextProfileId =
        loadedProfiles.find((profile) => profile.id === rememberedProfileId)?.id ||
        loadedProfiles[0]?.id ||
        "";
      setSelectedProfileId(nextProfileId);
    }

    loadProfiles();

    function handleProfileChange() {
      const rememberedProfileId = window.localStorage.getItem("selected-profile-id") || "";
      setSelectedProfileId(rememberedProfileId);
    }

    window.addEventListener("selected-profile-changed", handleProfileChange);
    return () => window.removeEventListener("selected-profile-changed", handleProfileChange);
  }, []);

  useEffect(() => {
    async function loadTodayFromDatabase() {
      if (!selectedProfileId || foods.length === 0) return;

      const supabase = createClient();
      const { data, error } = await supabase
        .from("daily_meals")
        .select("food_id, amount, meal_slot")
        .eq("profile_id", selectedProfileId)
        .eq("meal_date", getTodayKey())
        .order("created_at");

      if (error) {
        setSaveMessage(error.message);
        return;
      }

      const restored = ((data || []) as DailyMealRow[])
        .map((item) => {
          const food = foods.find((candidate) => candidate.id === item.food_id);
          return food
            ? {
                food,
                amount: Number(item.amount),
                mealSlot: item.meal_slot,
              }
            : null;
        })
        .filter((item): item is SelectedFood => item !== null);

      setSelectedFoods(restored);
      setHasLoadedDatabaseMeals(true);
      setSaveMessage(restored.length ? "Loaded today's saved meals." : "No meals saved for today yet.");

      const { data: logData, error: logError } = await supabase
        .from("daily_logs")
        .select("has_cardio, has_chocolate")
        .eq("profile_id", selectedProfileId)
        .eq("log_date", getTodayKey())
        .maybeSingle();

      if (logError) {
        setSaveMessage(logError.message);
        return;
      }

      const dailyLog = logData as DailyLogRow | null;
      setHasCardio(Boolean(dailyLog?.has_cardio));
      setHasChocolate(Boolean(dailyLog?.has_chocolate));
    }

    loadTodayFromDatabase();
  }, [foods, selectedProfileId]);

  useEffect(() => {
    if (foods.length === 0 || selectedProfileId) return;

    const saved = window.localStorage.getItem(getStorageKey());
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved) as StoredFoodSelection[];
      const restored = parsed
        .map((item) => {
          const food = foods.find((candidate) => candidate.id === item.foodId);
          return food
            ? {
                food,
                amount: item.amount,
                mealSlot: item.mealSlot,
              }
            : null;
        })
        .filter((item): item is SelectedFood => item !== null);

      setSelectedFoods(restored);
    } catch {
      window.localStorage.removeItem(getStorageKey());
    }
  }, [foods]);

  useEffect(() => {
    if (selectedProfileId) return;

    const payload: StoredFoodSelection[] = selectedFoods.map((item) => ({
      foodId: item.food.id,
      amount: item.amount,
      mealSlot: item.mealSlot,
    }));

    window.localStorage.setItem(getStorageKey(), JSON.stringify(payload));
  }, [selectedFoods, selectedProfileId]);

  const totals = useMemo(() => {
    let calculated = calculateDailyTotals(selectedFoods);

    if (hasChocolate) {
      calculated = {
        ...calculated,
        calories: calculated.calories + 70,
        protein: calculated.protein + 1,
        carbs: calculated.carbs + 5,
        fat: calculated.fat + 5,
      };
    }

    return roundMacros(calculated);
  }, [selectedFoods, hasChocolate]);

  function addFood() {
    const food = foods.find((item) => item.id === selectedFoodId);

    if (!food) return;

    setSelectedFoods((current) => [
      ...current,
      {
        food,
        amount,
        mealSlot: activeMeal,
      },
    ]);

    setAmount(food.serving_mode === "grams" ? Number(food.base_grams || 100) : 1);
  }

  function removeItem(index: number) {
    setSelectedFoods((current) => current.filter((_, i) => i !== index));
  }

  async function addSavedMeal() {
    if (!selectedTemplateId) return;

    const { data, error } = await createClient()
      .from("meal_template_items")
      .select("food_id, amount")
      .eq("meal_template_id", selectedTemplateId);

    if (error) {
      setSaveMessage(error.message);
      return;
    }

    const items = (data || []) as Pick<MealTemplateItem, "food_id" | "amount">[];
    const templateFoods = items
      .map((item) => {
        const food = foods.find((entry) => entry.id === item.food_id);
        return food
          ? {
              food,
              amount: Number(item.amount),
              mealSlot: activeMeal,
            }
          : null;
      })
      .filter((item): item is SelectedFood => item !== null);

    setSelectedFoods((current) => [...current, ...templateFoods]);
  }

  async function saveDay() {
    if (!selectedProfileId) {
      setSaveMessage("Create or choose a profile first.");
      return;
    }

    setIsSaving(true);
    setSaveMessage("");

    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("daily_meals")
      .delete()
      .eq("profile_id", selectedProfileId)
      .eq("meal_date", getTodayKey());

    if (deleteError) {
      setSaveMessage(deleteError.message);
      setIsSaving(false);
      return;
    }

    if (selectedFoods.length > 0) {
      const rows = selectedFoods.map((item) => ({
        profile_id: selectedProfileId,
        meal_date: getTodayKey(),
        food_id: item.food.id,
        meal_slot: item.mealSlot,
        amount: item.amount,
      }));

      const { error: insertError } = await supabase.from("daily_meals").insert(rows);

      if (insertError) {
        setSaveMessage(insertError.message);
        setIsSaving(false);
        return;
      }
    }

    const { error: logError } = await supabase.from("daily_logs").upsert(
      {
        profile_id: selectedProfileId,
        log_date: getTodayKey(),
        has_cardio: hasCardio,
        has_chocolate: hasChocolate,
      },
      { onConflict: "profile_id,log_date" }
    );

    if (logError) {
      setSaveMessage(logError.message);
      setIsSaving(false);
      return;
    }

    setSaveMessage("Today's meals saved.");
    setIsSaving(false);
  }

  const selectedFood = foods.find((food) => food.id === selectedFoodId);
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId);
  const cardioCalories = hasCardio ? 150 : 0;
  const dailyTargets = {
    calories: (selectedProfile?.calorie_target ?? targets.calories) + cardioCalories,
    protein: selectedProfile?.protein_target ?? targets.protein,
    carbs: selectedProfile?.carbs_target ?? targets.carbs,
    fat: selectedProfile?.fat_target ?? targets.fat,
  };
  const matchingFoods = foods
    .filter((food) =>
      `${food.name} ${food.brand || ""} ${food.category}`
        .toLowerCase()
        .includes(foodSearch.toLowerCase())
    )
    .slice(0, 8);

  function chooseFood(food: Food) {
    setSelectedFoodId(food.id);
    setFoodSearch(food.name);
    setAmount(food.serving_mode === "grams" ? Number(food.base_grams || 100) : 1);
  }

  return (
    <main className="app-shell">
      <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[1fr_380px]">
        <section className="order-2 lg:order-1">
          <p className="eyebrow mb-2 text-xs font-semibold">Fuel builder</p>
          <h1 className="mb-4 text-4xl font-bold">Daily Meal Calculator</h1>

          <div className="surface mb-4 rounded-3xl p-5">
            <div className="mb-4 flex items-center gap-3">
              <Apple className="h-5 w-5 text-lime-300" />
              <h2 className="text-xl font-semibold">Add Food</h2>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <select
                className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
                value={selectedProfileId}
                onChange={(event) => {
                  const id = event.target.value;
                  setSelectedProfileId(id);
                  window.localStorage.setItem("selected-profile-id", id);
                }}
              >
                <option value="">Choose profile</option>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>

              <select
                className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
                value={activeMeal}
                onChange={(e) => setActiveMeal(e.target.value as MealSlot)}
              >
                {mealSlots.map((slot) => (
                  <option key={slot.key} value={slot.key}>
                    {slot.label}
                  </option>
                ))}
              </select>

              <div className="relative">
                <input
                  className="w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
                  value={foodSearch}
                  onChange={(event) => {
                    setFoodSearch(event.target.value);
                    setSelectedFoodId("");
                  }}
                  placeholder="Search food"
                />

                {foodSearch && !selectedFood && matchingFoods.length > 0 && (
                  <div className="surface absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl">
                    {matchingFoods.map((food) => (
                      <button
                        key={food.id}
                        type="button"
                        onClick={() => chooseFood(food)}
                        className="flex w-full items-center justify-between gap-3 border-b border-white/8 px-4 py-3 text-left text-sm last:border-b-0 hover:bg-white/8"
                      >
                        <span>{food.name}</span>
                        <span className="muted">{food.serving_label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <input
                className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
                type="number"
                min="0"
                step={selectedFood?.serving_mode === "grams" ? "5" : "0.5"}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                placeholder="Amount"
              />
            </div>

            <p className="muted mt-2 text-sm">
              {selectedFood?.serving_mode === "grams"
                ? "Amount means grams."
                : "Amount means number of units."}
            </p>

            <button
              onClick={addFood}
              className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-lime-300 px-5 py-3 font-semibold text-black shadow-[0_0_24px_rgba(124,255,79,0.35)]"
            >
              <Plus className="h-4 w-4" />
              Add Food
            </button>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                onClick={saveDay}
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-2xl bg-white/8 px-5 py-3 font-semibold text-white transition hover:bg-white/12 disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {isSaving ? "Saving..." : "Save Day"}
              </button>
              <span className="muted text-sm">
                {selectedProfile
                  ? hasLoadedDatabaseMeals
                    ? saveMessage
                    : "Loading today's meals..."
                  : "Choose a profile to save daily logs."}
              </span>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
              <select
                className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
                value={selectedTemplateId}
                onChange={(event) => setSelectedTemplateId(event.target.value)}
              >
                <option value="">Add saved meal</option>
                {mealTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
              <button
                onClick={addSavedMeal}
                className="rounded-2xl bg-white/8 px-5 py-3 font-semibold"
              >
                Add Meal
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {mealSlots.map((slot) => {
              const items = selectedFoods
                .map((item, index) => ({ ...item, index }))
                .filter((item) => item.mealSlot === slot.key);

              return (
                <div key={slot.key} className="surface rounded-3xl p-5">
                  <h2 className="text-xl font-semibold mb-3">{slot.label}</h2>

                  {items.length === 0 ? (
                    <p className="muted text-sm">No foods added yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {items.map((item) => (
                        <div
                          key={item.index}
                          className="surface-strong flex items-center justify-between rounded-2xl p-3"
                        >
                          <div>
                            <div className="font-medium">{item.food.name}</div>
                            <div className="muted text-sm">
                              {item.amount}{" "}
                              {item.food.serving_mode === "grams" ? "g" : "unit(s)"}
                            </div>
                          </div>

                          <button
                            onClick={() => removeItem(item.index)}
                            className="inline-flex items-center gap-2 rounded-xl bg-white/6 px-3 py-2 text-sm text-slate-200"
                          >
                            <Trash2 className="h-4 w-4" />
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <div className="order-1 lg:hidden">
          <MacroSummary totals={totals} targets={dailyTargets} />
        </div>

        <aside className="order-3 space-y-4 lg:order-2">
          <div className="hidden lg:block">
            <MacroSummary totals={totals} targets={dailyTargets} />
          </div>

          <div className="surface rounded-3xl p-5">
            <div className="mb-4 flex items-center gap-3">
              <Dumbbell className="h-5 w-5 text-cyan-300" />
              <h2 className="text-xl font-semibold">Daily Options</h2>
            </div>

            <label className="mb-3 flex items-center gap-2">
              <input
                type="checkbox"
                checked={hasCardio}
                onChange={(e) => setHasCardio(e.target.checked)}
              />
              30 minutes cardio today (+150 calories)
            </label>

            {hasCardio && (
              <div className="mb-4 rounded-2xl border border-lime-300/15 bg-lime-300/10 p-3 text-sm text-lime-100">
                Your daily calorie target is 150 calories higher today. Best options: 1 banana, 1 Oikos,
                1 slice Ezekiel bread, 100 g cooked rice, or 150 g potato.
              </div>
            )}

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={hasChocolate}
                onChange={(e) => setHasChocolate(e.target.checked)}
              />
              Add 70-calorie chocolate square
            </label>

            {hasChocolate && (
              <div className="mt-3 rounded-2xl border border-amber-300/15 bg-amber-300/10 p-3 text-sm text-amber-100">
                This adds 70 calories today. Remove 1 slice Ezekiel bread, half a
                banana, or around 8 g oil if you want to keep calories equal.
              </div>
            )}
          </div>

          <div className="surface rounded-3xl p-5">
            <div className="mb-4 flex items-center gap-3">
              <TimerReset className="h-5 w-5 text-fuchsia-300" />
              <h2 className="text-xl font-semibold">Fasting Window</h2>
            </div>
            <p className="text-sm">
              Eating window: <strong>10:00 am – 8:00 pm</strong>
            </p>
            <p className="text-sm">
              Fasting window: <strong>8:00 pm – 10:00 am</strong>
            </p>

            <div className="muted mt-3 text-sm">
              Allowed: water, sparkling water, black coffee, plain tea,
              zero-calorie electrolytes.
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
