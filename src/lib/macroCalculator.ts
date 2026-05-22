import type { Food, MacroTotals, SelectedFood } from "./types";

export type AmountMode = "serving" | "grams";

export function minimumFoodAmount(food: Pick<Food, "category">, amountMode: AmountMode) {
  if (amountMode === "serving") return 0.25;
  if (food.category === "protein") return 50;
  if (food.category === "carb") return 30;
  if (food.category === "fat") return 5;
  return 10;
}

export function inferAmountMode(
  food: Pick<Food, "serving_mode" | "base_grams" | "category">,
  amount: number,
  amountMode?: AmountMode | null
): AmountMode {
  if (amountMode) return amountMode;
  if (food.serving_mode === "unit") {
    return food.base_grams && amount > 10 ? "grams" : "serving";
  }

  return amount < minimumFoodAmount(food, "grams") ? "serving" : "grams";
}

export function amountToGramEquivalent(
  food: Pick<Food, "base_grams">,
  amount: number,
  amountMode: AmountMode
) {
  if (amountMode === "grams") return amount;
  return food.base_grams ? amount * food.base_grams : null;
}

export function calculateFoodMacros(
  food: Food,
  amount: number,
  amountMode?: AmountMode | null
): MacroTotals {
  const mode = inferAmountMode(food, amount, amountMode);
  const multiplier =
    mode === "grams"
      ? amount / Number(food.base_grams || 100)
      : amount;
  const totalCarbs = food.carbs_g * multiplier;
  const fiber = food.fiber_g * multiplier;
  const sugarAlcohol = Number(food.sugar_alcohol_g || 0) * multiplier;
  const allulose = Number(food.allulose_g || 0) * multiplier;

  return {
    calories: food.calories * multiplier,
    protein: food.protein_g * multiplier,
    carbs: Math.max(0, totalCarbs - fiber - sugarAlcohol - allulose),
    fat: food.fat_g * multiplier,
    fiber,
  };
}

export function calculateDailyTotals(items: SelectedFood[]): MacroTotals {
  return items.reduce(
    (acc, item) => {
      const macros = calculateFoodMacros(item.food, item.amount, item.amountMode);

      return {
        calories: acc.calories + macros.calories,
        protein: acc.protein + macros.protein,
        carbs: acc.carbs + macros.carbs,
        fat: acc.fat + macros.fat,
        fiber: acc.fiber + macros.fiber,
      };
    },
    {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
    }
  );
}

export function roundMacros(totals: MacroTotals): MacroTotals {
  return {
    calories: Math.round(totals.calories),
    protein: Math.round(totals.protein),
    carbs: Math.round(totals.carbs),
    fat: Math.round(totals.fat),
    fiber: Math.round(totals.fiber),
  };
}
