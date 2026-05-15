"use client";

import { useEffect, useState } from "react";
import { Apple } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Food } from "@/lib/types";

export default function FoodsPage() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadFoods() {
      const supabase = createClient();

      const { data, error } = await supabase
        .from("foods")
        .select("*")
        .order("category")
        .order("name");

      if (error) {
        console.error(error);
      }

      setFoods((data || []) as Food[]);
      setLoading(false);
    }

    loadFoods();
  }, []);

  if (loading) {
    return <main className="app-shell">Loading foods...</main>;
  }

  return (
    <main className="app-shell">
      <div className="mx-auto max-w-6xl">
        <p className="eyebrow mb-2 text-xs font-semibold">Nutrition library</p>
        <h1 className="mb-4 flex items-center gap-3 text-4xl font-bold">
          <Apple className="h-8 w-8 text-lime-300" />
          Food Database
        </h1>

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
                <th className="p-3">Mode</th>
              </tr>
            </thead>
            <tbody>
              {foods.map((food) => (
                <tr key={food.id} className="border-t border-white/8">
                  <td className="p-3 font-medium">{food.name}</td>
                  <td className="p-3">{food.serving_label}</td>
                  <td className="p-3">{food.calories}</td>
                  <td className="p-3">{food.protein_g} g</td>
                  <td className="p-3">{food.carbs_g} g</td>
                  <td className="p-3">{food.fat_g} g</td>
                  <td className="p-3">{food.serving_mode}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
