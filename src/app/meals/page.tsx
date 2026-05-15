"use client";

import { useEffect, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Food, MealTemplate, MealTemplateItem, Profile } from "@/lib/types";
import { jazminMealTemplates, jazminPlanFoods } from "@/lib/jazminPlan";

type DraftItem = {
  foodId: string;
  amount: number;
};

export default function MealsPage() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [templates, setTemplates] = useState<MealTemplate[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [foodSearch, setFoodSearch] = useState("");
  const [selectedFoodId, setSelectedFoodId] = useState("");
  const [amount, setAmount] = useState(1);
  const [message, setMessage] = useState("");
  const [isImporting, setIsImporting] = useState(false);

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
    async function loadTemplates() {
      const query = createClient().from("meal_templates").select("*").order("name");
      const { data, error } = selectedProfileId
        ? await query.or(`profile_id.eq.${selectedProfileId},profile_id.is.null`)
        : await query.eq("profile_id", "");

      if (error) {
        setMessage(error.message);
        return;
      }

      setTemplates((data || []) as MealTemplate[]);
    }

    loadTemplates();
  }, [selectedProfileId]);

  const selectedFood = foods.find((food) => food.id === selectedFoodId);
  const matchingFoods = foods
    .filter((food) => food.name.toLowerCase().includes(foodSearch.toLowerCase()))
    .slice(0, 8);

  function chooseFood(food: Food) {
    setSelectedFoodId(food.id);
    setFoodSearch(food.name);
    setAmount(food.serving_mode === "grams" ? Number(food.base_grams || 100) : 1);
  }

  function addDraftItem() {
    if (!selectedFoodId) return;
    setDraftItems((current) => [...current, { foodId: selectedFoodId, amount }]);
    setSelectedFoodId("");
    setFoodSearch("");
    setAmount(1);
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
    }));

    const { error: itemsError } = await supabase.from("meal_template_items").insert(rows);
    if (itemsError) {
      setMessage(itemsError.message);
      return;
    }

    setTemplates((current) => [...current, template as MealTemplate]);
    setTemplateName("");
    setDraftItems([]);
    setMessage("Meal template saved.");
  }

  async function importJazminPlan() {
    if (!selectedProfileId) {
      setMessage("Choose Jazmin's profile first.");
      return;
    }

    setIsImporting(true);
    setMessage("");
    const supabase = createClient();

    const { data: existingFoods, error: foodsError } = await supabase
      .from("foods")
      .select("*")
      .in(
        "name",
        jazminPlanFoods.map((food) => food.name)
      );

    if (foodsError) {
      setMessage(foodsError.message);
      setIsImporting(false);
      return;
    }

    const existingFoodNames = new Set((existingFoods || []).map((food) => food.name));
    const foodsToInsert = jazminPlanFoods
      .filter((food) => !existingFoodNames.has(food.name))
      .map((food) => ({
        ...food,
        user_id: null,
        is_public: true,
      }));

    if (foodsToInsert.length > 0) {
      const { error } = await supabase.from("foods").insert(foodsToInsert);
      if (error) {
        setMessage(error.message);
        setIsImporting(false);
        return;
      }
    }

    const { data: refreshedFoods, error: refreshedFoodsError } = await supabase
      .from("foods")
      .select("*")
      .in(
        "name",
        jazminPlanFoods.map((food) => food.name)
      );

    if (refreshedFoodsError) {
      setMessage(refreshedFoodsError.message);
      setIsImporting(false);
      return;
    }

    const foodByName = new Map((refreshedFoods || []).map((food) => [food.name, food]));

    for (const template of jazminMealTemplates) {
      const { data: existingTemplate } = await supabase
        .from("meal_templates")
        .select("id")
        .eq("profile_id", selectedProfileId)
        .eq("name", template.name)
        .maybeSingle();

      if (existingTemplate) continue;

      const { data: createdTemplate, error: templateError } = await supabase
        .from("meal_templates")
        .insert({ profile_id: selectedProfileId, name: template.name })
        .select()
        .single();

      if (templateError) {
        setMessage(templateError.message);
        setIsImporting(false);
        return;
      }

      const rows = template.items.map(([foodName, itemAmount]) => ({
        meal_template_id: createdTemplate.id,
        food_id: foodByName.get(foodName)?.id,
        amount: itemAmount,
      }));

      const { error: itemError } = await supabase.from("meal_template_items").insert(rows);
      if (itemError) {
        setMessage(itemError.message);
        setIsImporting(false);
        return;
      }
    }

    setMessage("Jazmin's monthly plan was imported as saved meals.");
    setIsImporting(false);
    const { data } = await supabase.from("meal_templates").select("*").eq("profile_id", selectedProfileId).order("name");
    setTemplates((data || []) as MealTemplate[]);
  }

  return (
    <main className="app-shell">
      <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[1fr_340px]">
        <section className="surface rounded-3xl p-5">
          <p className="eyebrow mb-2 text-xs font-semibold">Meal builder</p>
          <h1 className="mb-4 text-4xl font-bold">Saved Meals</h1>

          <div className="grid gap-3 md:grid-cols-2">
            <input
              className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
              placeholder="Meal name"
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
            />
            <select
              className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
              value={selectedProfileId}
              onChange={(event) => setSelectedProfileId(event.target.value)}
            >
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_160px_auto]">
            <div className="relative">
              <input
                className="w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
                placeholder="Search food"
                value={foodSearch}
                onChange={(event) => {
                  setFoodSearch(event.target.value);
                  setSelectedFoodId("");
                }}
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
              value={amount}
              onChange={(event) => setAmount(Number(event.target.value))}
            />
            <button
              onClick={addDraftItem}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white/8 px-4 py-3 font-semibold"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {draftItems.map((item, index) => {
              const food = foods.find((entry) => entry.id === item.foodId);
              if (!food) return null;
              return (
                <div key={`${item.foodId}-${index}`} className="surface-strong flex items-center justify-between rounded-2xl p-3">
                  <div>
                    <div className="font-medium">{food.name}</div>
                    <div className="muted text-sm">{item.amount} {food.serving_mode === "grams" ? "g" : "unit(s)"}</div>
                  </div>
                  <button onClick={() => removeDraftItem(index)} className="rounded-xl bg-white/6 p-2">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>

          <button
            onClick={saveTemplate}
            className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-lime-300 px-5 py-3 font-semibold text-black"
          >
            <Save className="h-4 w-4" />
            Save Meal
          </button>
          <button
            onClick={importJazminPlan}
            disabled={isImporting}
            className="ml-3 mt-4 inline-flex items-center gap-2 rounded-2xl bg-white/8 px-5 py-3 font-semibold disabled:opacity-60"
          >
            {isImporting ? "Importing..." : "Import Jazmin Plan"}
          </button>
          {message && <p className="muted mt-3 text-sm">{message}</p>}
        </section>

        <aside className="surface rounded-3xl p-5">
          <h2 className="mb-4 text-2xl font-bold">Saved meals</h2>
          <div className="space-y-2">
            {templates.map((template) => (
              <div key={template.id} className="surface-strong rounded-2xl p-3">
                {template.name}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}
