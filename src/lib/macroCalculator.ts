import type { Food, MacroTotals, SelectedFood } from "./types";

export function calculateFoodMacros(
  food: Food,
  amount: number,
  amountMode: "serving" | "grams" = food.serving_mode === "grams" ? "grams" : "serving"
): MacroTotals {
  const multiplier =
    amountMode === "grams"
      ? amount / Number(food.base_grams || 100)
      : amount;

  return {
    calories: food.calories * multiplier,
    protein: food.protein_g * multiplier,
    carbs: food.carbs_g * multiplier,
    fat: food.fat_g * multiplier,
    fiber: food.fiber_g * multiplier,
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
