"use client";

import { useEffect, useRef, useState } from "react";
import { Apple, Camera, Pencil, Plus, Save, ScanBarcode, X } from "lucide-react";
import {
  Html5Qrcode,
  Html5QrcodeSupportedFormats,
} from "html5-qrcode";
import { createClient } from "@/lib/supabase/client";
import type { Food } from "@/lib/types";

type EditableFoodFields = Pick<
  Food,
  "calories" | "protein_g" | "carbs_g" | "fat_g" | "fiber_g" | "max_amount" | "allowed_meal_slots" | "serving_mode" | "serving_label" | "base_grams"
>;

type FoodDraft = Omit<Food, "id" | "user_id" | "is_public">;

type OpenFoodFactsProduct = {
  product_name?: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: number;
  nutriments?: {
    "energy-kcal_serving"?: number;
    "energy-kcal_100g"?: number;
    proteins_serving?: number;
    proteins_100g?: number;
    carbohydrates_serving?: number;
    carbohydrates_100g?: number;
    fat_serving?: number;
    fat_100g?: number;
    fiber_serving?: number;
    fiber_100g?: number;
  };
};

type ScannedUnitBasis = {
  grams: number;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number;
};

const fallbackDraft: FoodDraft = {
  name: "",
  brand: null,
  category: "other",
  serving_mode: "grams",
  serving_label: "100 g",
  base_grams: 100,
  calories: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  fiber_g: 0,
  is_available: true,
  max_amount: null,
  allowed_meal_slots: ["breakfast", "snack_1", "lunch", "snack_2", "dinner"],
};

export default function FoodsPage() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingFoodId, setEditingFoodId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<EditableFoodFields | null>(null);
  const [savingFoodId, setSavingFoodId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [barcode, setBarcode] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [draftFood, setDraftFood] = useState<FoodDraft | null>(null);
  const [scannedUnitBasis, setScannedUnitBasis] = useState<ScannedUnitBasis | null>(null);
  const [addingFood, setAddingFood] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scannerMessage, setScannerMessage] = useState("");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    protein: true,
    carb: true,
    fat: true,
    other: true,
  });
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerElementId = "food-barcode-reader";

  useEffect(() => {
    async function loadFoods() {
      const { data, error } = await createClient()
        .from("foods")
        .select("*")
        .order("category")
        .order("name");

      if (error) {
        setMessage(error.message);
      }

      setFoods((data || []) as Food[]);
      setLoading(false);
    }

    loadFoods();

    return () => {
      void stopScanner();
    };
  }, []);

  function startEditing(food: Food) {
    setEditingFoodId(food.id);
    setEditValues({
      calories: food.calories,
      protein_g: food.protein_g,
      carbs_g: food.carbs_g,
      fat_g: food.fat_g,
      fiber_g: food.fiber_g,
      max_amount: food.max_amount,
      allowed_meal_slots: food.allowed_meal_slots || ["breakfast", "snack_1", "lunch", "snack_2", "dinner"],
      serving_mode: food.serving_mode,
      serving_label: food.serving_label,
      base_grams: food.base_grams,
    });
    setMessage("");
  }

  function cancelEditing() {
    setEditingFoodId(null);
    setEditValues(null);
  }

  async function saveFood(foodId: string) {
    if (!editValues) return;

    setSavingFoodId(foodId);
    setMessage("");

    const { data, error } = await createClient()
      .from("foods")
      .update(editValues)
      .eq("id", foodId)
      .select("*")
      .single();

    if (error) {
      setMessage(error.message);
      setSavingFoodId(null);
      return;
    }

    setFoods((current) =>
      current.map((food) => (food.id === foodId ? (data as Food) : food))
    );
    setMessage("Macros saved.");
    setSavingFoodId(null);
    cancelEditing();
  }

  async function toggleAvailability(food: Food) {
    const nextValue = food.is_available === false;
    const { data, error } = await createClient()
      .from("foods")
      .update({ is_available: nextValue })
      .eq("id", food.id)
      .select("*")
      .single();

    if (error) {
      setMessage(error.message);
      return;
    }

    setFoods((current) =>
      current.map((item) => (item.id === food.id ? (data as Food) : item))
    );
  }

  async function deleteFood(foodId: string) {
    const { error } = await createClient().from("foods").delete().eq("id", foodId);
    if (error) {
      setMessage(error.message);
      return;
    }
    setFoods((current) => current.filter((food) => food.id !== foodId));
    setMessage("Food deleted.");
  }

  async function lookupBarcode(code = barcode) {
    const cleaned = code.trim();
    if (!cleaned) {
      setMessage("Enter or scan a barcode first.");
      return;
    }

    setLookupLoading(true);
    setMessage("");
    setDraftFood(null);
    setScannedUnitBasis(null);

    try {
      const response = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(cleaned)}.json`
      );
      const result = (await response.json()) as {
        status?: number;
        product?: OpenFoodFactsProduct;
      };

      if (!response.ok || result.status !== 1 || !result.product) {
        setMessage("No food found for that barcode.");
        return;
      }

      const product = result.product;
      const servingQuantity =
        Number(product.serving_quantity) ||
        parseServingGrams(product.serving_size) ||
        100;
      const hasServingMacros = product.nutriments?.["energy-kcal_serving"] != null;
      const servingLabel = product.serving_size || (hasServingMacros ? "1 serving" : "100 g");
      const unitBasis = hasServingMacros
        ? {
            grams: servingQuantity,
            caloriesPer100g: per100gValue(
              product.nutriments?.["energy-kcal_100g"],
              product.nutriments?.["energy-kcal_serving"],
              servingQuantity
            ),
            proteinPer100g: per100gValue(
              product.nutriments?.proteins_100g,
              product.nutriments?.proteins_serving,
              servingQuantity
            ),
            carbsPer100g: per100gValue(
              product.nutriments?.carbohydrates_100g,
              product.nutriments?.carbohydrates_serving,
              servingQuantity
            ),
            fatPer100g: per100gValue(
              product.nutriments?.fat_100g,
              product.nutriments?.fat_serving,
              servingQuantity
            ),
            fiberPer100g: per100gValue(
              product.nutriments?.fiber_100g,
              product.nutriments?.fiber_serving,
              servingQuantity
            ),
          }
        : null;

      setDraftFood({
        ...fallbackDraft,
        name: product.product_name || "Unnamed scanned food",
        brand: product.brands || null,
        serving_mode: hasServingMacros ? "unit" : "grams",
        serving_label: hasServingMacros ? "1 serving" : servingLabel,
        base_grams: servingQuantity || 100,
        calories: numberOrZero(
          hasServingMacros
            ? product.nutriments?.["energy-kcal_serving"]
            : product.nutriments?.["energy-kcal_100g"]
        ),
        protein_g: numberOrZero(
          hasServingMacros
            ? product.nutriments?.proteins_serving
            : product.nutriments?.proteins_100g
        ),
        carbs_g: numberOrZero(
          hasServingMacros
            ? product.nutriments?.carbohydrates_serving
            : product.nutriments?.carbohydrates_100g
        ),
        fat_g: numberOrZero(
          hasServingMacros ? product.nutriments?.fat_serving : product.nutriments?.fat_100g
        ),
        fiber_g: numberOrZero(
          hasServingMacros ? product.nutriments?.fiber_serving : product.nutriments?.fiber_100g
        ),
      });
      setScannedUnitBasis(unitBasis);
    } catch {
      setMessage("Could not look up that barcode right now.");
    } finally {
      setLookupLoading(false);
    }
  }

  async function addDraftFood() {
    if (!draftFood) return;

    setAddingFood(true);
    setMessage("");

    const { data, error } = await createClient()
      .from("foods")
      .insert({
        ...draftFood,
        user_id: null,
        is_public: false,
      })
      .select("*")
      .single();

    if (error) {
      setMessage(error.message);
      setAddingFood(false);
      return;
    }

    setFoods((current) => [...current, data as Food]);
    setDraftFood(null);
    setScannedUnitBasis(null);
    setBarcode("");
    setAddingFood(false);
    setMessage("Food added to the database.");
  }

  function updateDraftUnitServing(grams: number, basis: ScannedUnitBasis) {
    if (!Number.isFinite(grams) || grams <= 0) return;

    setDraftFood((current) =>
      current
        ? {
            ...current,
            base_grams: grams,
            calories: scalePer100g(basis.caloriesPer100g, grams),
            protein_g: scalePer100g(basis.proteinPer100g, grams),
            carbs_g: scalePer100g(basis.carbsPer100g, grams),
            fat_g: scalePer100g(basis.fatPer100g, grams),
            fiber_g: scalePer100g(basis.fiberPer100g, grams),
          }
        : current
    );
  }

  async function startScanner() {
    try {
      const scanner = new Html5Qrcode(scannerElementId, {
        verbose: false,
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
        ],
      });

      scannerRef.current = scanner;
      setIsScanning(true);
      setScannerMessage("Point the camera at the barcode.");

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 280, height: 140 },
          aspectRatio: 1.777778,
        },
        (detectedCode) => {
          if (!detectedCode) return;
          setBarcode(detectedCode);
          setScannerMessage(`Scanned ${detectedCode}.`);
          void stopScanner();
          void lookupBarcode(detectedCode);
        },
        () => {
          // Keep scanning quietly until a readable barcode appears.
        }
      );
    } catch {
      setScannerMessage(
        "Camera access was blocked or unavailable. You can still type the barcode below."
      );
      await stopScanner();
    }
  }

  async function stopScanner() {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
      } catch {
        // The scanner may already be stopped.
      }

      try {
        await scannerRef.current.clear();
      } catch {
        // Clearing an already-cleared scanner is harmless.
      }
    }

    scannerRef.current = null;
    setIsScanning(false);
  }

  if (loading) {
    return <main className="app-shell">Loading foods...</main>;
  }

  const filteredFoods = foods.filter((food) =>
    `${food.name} ${food.brand || ""} ${food.category}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );
  const groupedFoods = {
    protein: filteredFoods.filter((food) => food.category === "protein"),
    carb: filteredFoods.filter((food) => food.category === "carb"),
    fat: filteredFoods.filter((food) => food.category === "fat"),
    other: filteredFoods.filter(
      (food) => !["protein", "carb", "fat"].includes(food.category)
    ),
  };

  return (
    <main className="app-shell">
      <div className="mx-auto max-w-6xl space-y-4">
        <div>
          <p className="eyebrow mb-2 text-xs font-semibold">Nutrition library</p>
          <h1 className="mb-4 flex items-center gap-3 text-4xl font-bold">
            <Apple className="h-8 w-8 text-lime-300" />
            Food Database
          </h1>
        </div>

        <section className="surface rounded-3xl p-5">
          <div className="mb-4 flex items-center gap-3">
            <ScanBarcode className="h-5 w-5 text-lime-300" />
            <h2 className="text-xl font-semibold">Add food by barcode</h2>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
            <input
              className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
              placeholder="Type or scan a barcode"
              value={barcode}
              onChange={(event) => setBarcode(event.target.value)}
            />
            <button
              type="button"
              onClick={() => lookupBarcode()}
              disabled={lookupLoading}
              className="rounded-2xl bg-lime-300 px-4 py-3 font-semibold text-black disabled:opacity-60"
            >
              {lookupLoading ? "Looking up..." : "Find food"}
            </button>
            <button
              type="button"
              onClick={isScanning ? stopScanner : startScanner}
              className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
            >
              {isScanning ? <X className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
              {isScanning ? "Stop camera" : "Use camera"}
            </button>
          </div>

          {scannerMessage && <p className="muted mt-3 text-sm">{scannerMessage}</p>}

          <div
            id={scannerElementId}
            className={`${isScanning ? "mt-4" : ""} overflow-hidden rounded-2xl border border-white/10`}
          />

          {draftFood && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="font-semibold">{draftFood.name}</h3>
                  <p className="muted text-sm">
                    {draftFood.brand || "Unknown brand"} · {formatServingSummary(draftFood)}
                  </p>
                  <p className="mt-2 text-sm">
                    {draftFood.calories} cal · {draftFood.protein_g}g protein · {draftFood.carbs_g}g
                    carbs · {draftFood.fat_g}g fat
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addDraftFood}
                  disabled={addingFood}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-lime-300 px-4 py-3 font-semibold text-black disabled:opacity-60"
                >
                  <Plus className="h-4 w-4" />
                  {addingFood ? "Adding..." : "Add food"}
                </button>
              </div>
              {draftFood.serving_mode === "unit" && scannedUnitBasis && (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-medium">Personal serving</span>
                    <input
                      className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
                      value={draftFood.serving_label}
                      onChange={(event) =>
                        setDraftFood((current) =>
                          current ? { ...current, serving_label: event.target.value } : current
                        )
                      }
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium">Grams per serving</span>
                    <input
                      className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
                      type="number"
                      min="1"
                      step="1"
                      value={draftFood.base_grams ?? scannedUnitBasis.grams}
                      onChange={(event) =>
                        updateDraftUnitServing(Number(event.target.value), scannedUnitBasis)
                      }
                    />
                  </label>
                </div>
              )}
            </div>
          )}
        </section>

        <input
          className="surface w-full rounded-2xl p-3 text-white outline-none md:max-w-md"
          placeholder="Search foods"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        {message && <p className="text-sm text-lime-100">{message}</p>}

        <div className="space-y-4">
          {Object.entries(groupedFoods).map(([category, categoryFoods]) => (
            <section key={category} className="surface overflow-hidden rounded-3xl">
              <button
                type="button"
                onClick={() =>
                  setOpenSections((current) => ({
                    ...current,
                    [category]: !current[category],
                  }))
                }
                className="flex w-full items-center justify-between bg-white/5 px-4 py-4 text-left"
              >
                <span className="text-lg font-semibold capitalize">{category}s</span>
                <span className="muted text-sm">{openSections[category] ? "Close" : "Open"}</span>
              </button>

              {openSections[category] && (
                <>
                <div className="space-y-2 p-3 md:hidden">
                  {categoryFoods.map((food) => (
                    <div key={food.id} className="surface-strong flex items-center justify-between gap-3 rounded-2xl p-3">
                      <div className="font-medium">{food.name}</div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => toggleAvailability(food)}
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            food.is_available === false
                              ? "bg-white/8 text-slate-300"
                              : "bg-lime-300 text-black"
                          }`}
                        >
                          {food.is_available === false ? "No" : "Yes"}
                        </button>
                        <button
                          type="button"
                          onClick={() => startEditing(food)}
                          className="rounded-xl border border-white/10 p-2"
                          aria-label={`Edit ${food.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteFood(food.id)}
                          className="rounded-xl border border-white/10 p-2"
                          aria-label={`Delete ${food.name}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-sm">
                    <thead className="bg-white/5 text-left">
                      <tr>
                        <th className="p-3">Food</th>
                        <th className="p-3">Serving</th>
                        <th className="p-3">Calories</th>
                        <th className="p-3">Protein</th>
                        <th className="p-3">Carbs</th>
                        <th className="p-3">Fat</th>
                <th className="p-3">Fiber</th>
                        <th className="p-3">Max</th>
                        <th className="p-3">Meals</th>
                        <th className="p-3">Have it?</th>
                        <th className="p-3">Mode</th>
                        <th className="p-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categoryFoods.map((food) => (
                  <tr key={food.id} className="border-t border-white/8">
                    <td className="p-3 font-medium">{food.name}</td>
                    <td className="p-3">{food.serving_label}</td>
                    <td className="p-3">{food.calories}</td>
                    <td className="p-3">{food.protein_g} g</td>
                    <td className="p-3">{food.carbs_g} g</td>
                    <td className="p-3">{food.fat_g} g</td>
                    <td className="p-3">{food.fiber_g} g</td>
                    <td className="p-3">{food.max_amount ?? "—"}{food.max_amount != null && food.serving_mode === "grams" ? " g" : ""}</td>
                    <td className="p-3 text-xs">{formatAllowedSlots(food.allowed_meal_slots)}</td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => toggleAvailability(food)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          food.is_available === false
                            ? "bg-white/8 text-slate-300"
                            : "bg-lime-300 text-black"
                        }`}
                      >
                        {food.is_available === false ? "No" : "Yes"}
                      </button>
                    </td>
                    <td className="p-3">{food.serving_mode}</td>
                    <td className="p-3">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => startEditing(food)}
                            className="rounded-xl border border-white/10 p-2"
                            aria-label={`Edit ${food.name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteFood(food.id)}
                            className="rounded-xl border border-white/10 p-2"
                            aria-label={`Delete ${food.name}`}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                    </td>
                  </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </>
              )}
            </section>
          ))}
        </div>
      </div>
      {editingFoodId && editValues && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="surface w-full max-w-2xl rounded-3xl p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold">Edit food</h2>
              <button onClick={cancelEditing} className="rounded-xl bg-white/6 p-2">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium">Unit mode</span>
                <select
                  className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
                  value={editValues.serving_mode}
                  onChange={(event) =>
                    setEditValues((current) =>
                      current
                        ? {
                            ...current,
                            serving_mode: event.target.value as Food["serving_mode"],
                            base_grams:
                              event.target.value === "grams"
                                ? current.base_grams || 100
                                : null,
                          }
                        : current
                    )
                  }
                >
                  <option value="grams">Grams</option>
                  <option value="unit">Unit</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium">Serving label</span>
                <input
                  className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
                  value={editValues.serving_label}
                  onChange={(event) =>
                    setEditValues((current) =>
                      current ? { ...current, serving_label: event.target.value } : current
                    )
                  }
                />
              </label>
              {editValues.serving_mode === "grams" && (
                <ModalNumber
                  label="Base grams"
                  value={editValues.base_grams ?? 100}
                  onChange={(value) =>
                    setEditValues((current) =>
                      current ? { ...current, base_grams: value } : current
                    )
                  }
                />
              )}
              <ModalNumber label="Calories" value={editValues.calories} onChange={(value) => setEditValues((current) => current ? { ...current, calories: value } : current)} />
              <ModalNumber label="Max amount" value={editValues.max_amount ?? 0} onChange={(value) => setEditValues((current) => current ? { ...current, max_amount: value || null } : current)} />
              <ModalNumber label="Protein g" value={editValues.protein_g} onChange={(value) => setEditValues((current) => current ? { ...current, protein_g: value } : current)} />
              <ModalNumber label="Carbs g" value={editValues.carbs_g} onChange={(value) => setEditValues((current) => current ? { ...current, carbs_g: value } : current)} />
              <ModalNumber label="Fat g" value={editValues.fat_g} onChange={(value) => setEditValues((current) => current ? { ...current, fat_g: value } : current)} />
              <ModalNumber label="Fiber g" value={editValues.fiber_g} onChange={(value) => setEditValues((current) => current ? { ...current, fiber_g: value } : current)} />
            </div>
            <div className="mt-4">
              <div className="mb-2 text-sm font-medium">Allowed meals</div>
              <div className="flex flex-wrap gap-2">
                {mealSlotOptions.map((slot) => (
                  <label key={slot.value} className="inline-flex items-center gap-2 rounded-xl bg-white/6 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editValues.allowed_meal_slots.includes(slot.value)}
                      onChange={(event) =>
                        setEditValues((current) =>
                          current
                            ? {
                                ...current,
                                allowed_meal_slots: event.target.checked
                                  ? [...current.allowed_meal_slots, slot.value]
                                  : current.allowed_meal_slots.filter((value) => value !== slot.value),
                              }
                            : current
                        )
                      }
                    />
                    {slot.label}
                  </label>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => saveFood(editingFoodId)}
              disabled={savingFoodId === editingFoodId}
              className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-lime-300 px-5 py-3 font-semibold text-black disabled:opacity-60"
            >
              <Save className="h-4 w-4" /> Save food
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

const mealSlotOptions = [
  { value: "breakfast", label: "Breakfast" },
  { value: "snack_1", label: "Snack 1" },
  { value: "lunch", label: "Lunch" },
  { value: "snack_2", label: "Snack 2" },
  { value: "dinner", label: "Dinner" },
] as const;

function ModalNumber({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 p-3 text-white" type="number" min="0" step="0.1" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function formatAllowedSlots(slots: Food["allowed_meal_slots"]) {
  if (!slots?.length) return "None";
  return slots.map((slot) => slot.replace("_", " ")).join(", ");
}

function numberOrZero(value: number | undefined) {
  return Number.isFinite(value) ? Number(value) : 0;
}

function per100gValue(
  valuePer100g: number | undefined,
  valuePerServing: number | undefined,
  servingGrams: number
) {
  if (Number.isFinite(valuePer100g)) return Number(valuePer100g);
  if (!Number.isFinite(valuePerServing) || !servingGrams) return 0;
  return (Number(valuePerServing) / servingGrams) * 100;
}

function scalePer100g(valuePer100g: number, grams: number) {
  return roundToOneDecimal((valuePer100g * grams) / 100);
}

function parseServingGrams(servingSize?: string) {
  const match = servingSize?.match(/(\d+(?:\.\d+)?)\s*g\b/i);
  return match ? Number(match[1]) : 0;
}

function formatServingSummary(
  food: Pick<FoodDraft, "serving_mode" | "serving_label" | "base_grams">
) {
  if (food.serving_mode === "unit" && food.base_grams) {
    return `${food.serving_label} (${food.base_grams} g)`;
  }
  return food.serving_label;
}

function roundToOneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

