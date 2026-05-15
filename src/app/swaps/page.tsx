"use client";

import { useMemo, useState } from "react";
import { ArrowRightLeft } from "lucide-react";

type SwapGroup = "carb" | "protein" | "fat";

type SwapFood = {
  name: string;
  unit: string;
  equivalent: number;
};

const swapGroups: Record<SwapGroup, { label: string; foods: SwapFood[] }> = {
  carb: {
    label: "Carbs",
    foods: [
      { name: "Cooked rice", unit: "g", equivalent: 100 },
      { name: "Cooked potato", unit: "g", equivalent: 150 },
      { name: "Cooked sweet potato", unit: "g", equivalent: 130 },
      { name: "Cooked quinoa", unit: "g", equivalent: 120 },
      { name: "Ezekiel tortilla", unit: "tortilla", equivalent: 1 },
      { name: "Ezekiel bread", unit: "slices", equivalent: 2 },
      { name: "Cooked beans", unit: "g", equivalent: 120 },
      { name: "Cooked lentils", unit: "g", equivalent: 120 },
      { name: "Medium banana", unit: "banana", equivalent: 1 },
      { name: "Cooked pasta", unit: "cup", equivalent: 0.75 },
    ],
  },
  protein: {
    label: "Proteins",
    foods: [
      { name: "Chicken breast", unit: "g", equivalent: 100 },
      { name: "Tuna can", unit: "can", equivalent: 1 },
      { name: "Tilapia", unit: "g", equivalent: 120 },
      { name: "Egg whites", unit: "g", equivalent: 220 },
      { name: "Protein shake", unit: "shake", equivalent: 1 },
      { name: "Cottage cheese", unit: "g", equivalent: 220 },
    ],
  },
  fat: {
    label: "Fats",
    foods: [
      { name: "Olive oil", unit: "g", equivalent: 10 },
      { name: "Avocado oil", unit: "g", equivalent: 10 },
      { name: "Avocado", unit: "g", equivalent: 65 },
      { name: "Peanut butter", unit: "g", equivalent: 16 },
      { name: "Feta", unit: "g", equivalent: 40 },
      { name: "Boiled eggs", unit: "eggs", equivalent: 2 },
    ],
  },
};

export default function SwapsPage() {
  const [group, setGroup] = useState<SwapGroup>("carb");
  const [amount, setAmount] = useState(130);
  const [fromFoodName, setFromFoodName] = useState("Cooked rice");
  const [toFoodName, setToFoodName] = useState("Cooked potato");

  const foods = swapGroups[group].foods;

  const fromFood = useMemo(
    () => foods.find((food) => food.name === fromFoodName) || foods[0],
    [foods, fromFoodName]
  );
  const toFood = useMemo(
    () => foods.find((food) => food.name === toFoodName) || foods[1] || foods[0],
    [foods, toFoodName]
  );

  const convertedAmount = fromFood
    ? (amount / fromFood.equivalent) * toFood.equivalent
    : 0;

  function changeGroup(nextGroup: SwapGroup) {
    const nextFoods = swapGroups[nextGroup].foods;
    setGroup(nextGroup);
    setFromFoodName(nextFoods[0].name);
    setToFoodName(nextFoods[1]?.name || nextFoods[0].name);
  }

  return (
    <main className="app-shell">
      <div className="mx-auto max-w-4xl">
        <p className="eyebrow mb-2 text-xs font-semibold">Equal trade system</p>
        <h1 className="mb-4 text-4xl font-bold">Macro Swap Converter</h1>

        <section className="surface rounded-3xl p-5">
          <div className="grid gap-3 md:grid-cols-4">
            <select
              className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
              value={group}
              onChange={(event) => changeGroup(event.target.value as SwapGroup)}
            >
              {Object.entries(swapGroups).map(([key, value]) => (
                <option key={key} value={key}>
                  {value.label}
                </option>
              ))}
            </select>

            <input
              className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
              type="number"
              min="0"
              value={amount}
              onChange={(event) => setAmount(Number(event.target.value))}
            />

            <select
              className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
              value={fromFood.name}
              onChange={(event) => setFromFoodName(event.target.value)}
            >
              {foods.map((food) => (
                <option key={food.name} value={food.name}>
                  {food.name}
                </option>
              ))}
            </select>

            <select
              className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white"
              value={toFood.name}
              onChange={(event) => setToFoodName(event.target.value)}
            >
              {foods.map((food) => (
                <option key={food.name} value={food.name}>
                  {food.name}
                </option>
              ))}
            </select>
          </div>

          <div className="surface-strong mt-5 rounded-3xl p-5">
            <div className="mb-3 flex items-center gap-3 text-lime-300">
              <ArrowRightLeft className="h-5 w-5" />
              <span className="text-sm font-semibold uppercase tracking-[0.18em]">Equivalent amount</span>
            </div>
            <p className="text-2xl font-semibold md:text-3xl">
              {amount} {fromFood.unit} of {fromFood.name} =
              {" "}
              <span className="neon-text">
                {Number.isInteger(convertedAmount)
                  ? convertedAmount
                  : convertedAmount.toFixed(2)}{" "}
                {toFood.unit}
              </span>{" "}
              of {toFood.name}
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
