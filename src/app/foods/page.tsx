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
  "calories" | "protein_g" | "carbs_g" | "fat_g" | "fiber_g"
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
  const [addingFood, setAddingFood] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scannerMessage, setScannerMessage] = useState("");
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

  async function lookupBarcode(code = barcode) {
    const cleaned = code.trim();
    if (!cleaned) {
      setMessage("Enter or scan a barcode first.");
      return;
    }

    setLookupLoading(true);
    setMessage("");
    setDraftFood(null);

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
      const servingQuantity = Number(product.serving_quantity || 100);
      const hasServingMacros = product.nutriments?.["energy-kcal_serving"] != null;
      const servingLabel = product.serving_size || (hasServingMacros ? "1 serving" : "100 g");

      setDraftFood({
        ...fallbackDraft,
        name: product.product_name || "Unnamed scanned food",
        brand: product.brands || null,
        serving_mode: hasServingMacros ? "unit" : "grams",
        serving_label: servingLabel,
        base_grams: hasServingMacros ? null : servingQuantity || 100,
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
    setBarcode("");
    setAddingFood(false);
    setMessage("Food added to the database.");
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
                    {draftFood.brand || "Unknown brand"} · {draftFood.serving_label}
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

        <div className="surface overflow-x-auto rounded-3xl">
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
                <th className="p-3">Have it?</th>
                <th className="p-3">Mode</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredFoods.map((food) => {
                const isEditing = editingFoodId === food.id;

                return (
                  <tr key={food.id} className="border-t border-white/8">
                    <td className="p-3 font-medium">{food.name}</td>
                    <td className="p-3">{food.serving_label}</td>
                    <MacroCell
                      value={isEditing ? editValues?.calories : food.calories}
                      editing={isEditing}
                      onChange={(value) =>
                        setEditValues((current) =>
                          current ? { ...current, calories: value } : current
                        )
                      }
                    />
                    <MacroCell
                      value={isEditing ? editValues?.protein_g : food.protein_g}
                      editing={isEditing}
                      suffix=" g"
                      onChange={(value) =>
                        setEditValues((current) =>
                          current ? { ...current, protein_g: value } : current
                        )
                      }
                    />
                    <MacroCell
                      value={isEditing ? editValues?.carbs_g : food.carbs_g}
                      editing={isEditing}
                      suffix=" g"
                      onChange={(value) =>
                        setEditValues((current) =>
                          current ? { ...current, carbs_g: value } : current
                        )
                      }
                    />
                    <MacroCell
                      value={isEditing ? editValues?.fat_g : food.fat_g}
                      editing={isEditing}
                      suffix=" g"
                      onChange={(value) =>
                        setEditValues((current) =>
                          current ? { ...current, fat_g: value } : current
                        )
                      }
                    />
                    <MacroCell
                      value={isEditing ? editValues?.fiber_g : food.fiber_g}
                      editing={isEditing}
                      suffix=" g"
                      onChange={(value) =>
                        setEditValues((current) =>
                          current ? { ...current, fiber_g: value } : current
                        )
                      }
                    />
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
                      {isEditing ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => saveFood(food.id)}
                            disabled={savingFoodId === food.id}
                            className="rounded-xl bg-lime-300 p-2 text-black disabled:opacity-60"
                            aria-label={`Save ${food.name}`}
                          >
                            <Save className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditing}
                            className="rounded-xl border border-white/10 p-2"
                            aria-label={`Cancel editing ${food.name}`}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEditing(food)}
                          className="rounded-xl border border-white/10 p-2"
                          aria-label={`Edit ${food.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

function MacroCell({
  value,
  editing,
  suffix = "",
  onChange,
}: {
  value: number | undefined;
  editing: boolean;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <td className="p-3">
      {editing ? (
        <input
          className="w-24 rounded-xl border border-white/10 bg-white/5 p-2 text-white"
          type="number"
          min="0"
          step="0.1"
          value={value ?? 0}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      ) : (
        <>
          {value}
          {suffix}
        </>
      )}
    </td>
  );
}

function numberOrZero(value: number | undefined) {
  return Number.isFinite(value) ? Number(value) : 0;
}
