import { calculateFoodMacros } from "./macroCalculator";
import type {
  Food,
  MacroTotals,
  MealRule,
  MealSlot,
  MealTemplate,
  MealTemplateItem,
  Profile,
} from "./types";

export const plannerSlots: { key: MealSlot; label: string; share: number }[] = [
  { key: "breakfast", label: "Breakfast", share: 0.22 },
  { key: "snack_1", label: "Snack 1", share: 0.1 },
  { key: "lunch", label: "Lunch", share: 0.28 },
  { key: "snack_2", label: "Snack 2", share: 0.12 },
  { key: "dinner", label: "Dinner", share: 0.28 },
];

export type TemplateOption = {
  template: MealTemplate;
  items: MealTemplateItem[];
  macros: MacroTotals;
};

export function inferMealSlot(template: MealTemplate): MealSlot | null {
  if (template.meal_slot) return template.meal_slot;

  const name = template.name.toLowerCase();
  if (name.includes("breakfast")) return "breakfast";
  if (name.includes("snack 2")) return "snack_2";
  if (name.includes("snack")) return "snack_1";
  if (name.includes("lunch")) return "lunch";
  if (name.includes("dinner")) return "dinner";
  return null;
}

export function buildTemplateOptions(
  templates: MealTemplate[],
  templateItems: MealTemplateItem[],
  foods: Food[]
): TemplateOption[] {
  const foodById = new Map(foods.map((food) => [food.id, food]));
  const availableFoodIds = new Set(
    foods.filter((food) => food.is_available !== false).map((food) => food.id)
  );

  return templates.reduce<TemplateOption[]>((result, template) => {
      const items = templateItems.filter((item) => item.meal_template_id === template.id);
      const slot = inferMealSlot(template);
      if (!slot || items.length === 0) return result;
      if (items.some((item) => !availableFoodIds.has(item.food_id))) return result;

      const macros = items.reduce<MacroTotals>(
        (totals, item) => {
          const food = foodById.get(item.food_id);
          if (!food) return totals;
          const next = calculateFoodMacros(food, item.amount);
          return {
            calories: totals.calories + next.calories,
            protein: totals.protein + next.protein,
            carbs: totals.carbs + next.carbs,
            fat: totals.fat + next.fat,
            fiber: totals.fiber + next.fiber,
          };
        },
        { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
      );

      result.push({
        template: { ...template, meal_slot: slot },
        items,
        macros,
      });
      return result;
    }, []);
}


export function getSlotOptions(
  options: TemplateOption[],
  slot: MealSlot,
  rules: MealRule[]
) {
  const activeRules = rules.filter((rule) => rule.is_active && rule.meal_slot === slot);
  const slotOptions = options.filter((option) => inferMealSlot(option.template) === slot);

  if (activeRules.length === 0) return slotOptions;

  return slotOptions.filter((option) =>
    activeRules.every((rule) => {
      if (rule.rule_type === "required_food") {
        return option.items.some((item) => item.food_id === rule.required_food_id);
      }
      return true;
    })
  );
}

export function choosePlan(
  profile: Profile,
  options: TemplateOption[],
  rules: MealRule[]
) {
  return plannerSlots.map((slot) => {
    const slotOptions = getSlotOptions(options, slot.key, rules);
    const target = slotTarget(profile, slot.share);
    const ranked = [...slotOptions].sort(
      (a, b) => scoreOption(a.macros, target) - scoreOption(b.macros, target)
    );
    const top = ranked.slice(0, Math.min(3, ranked.length));
    const selected = top[Math.floor(Math.random() * Math.max(1, top.length))] || null;
    return { slot: slot.key, selected, options: ranked };
  });
}

export function chooseOptimizedDayPlan(
  profile: Profile,
  options: TemplateOption[],
  rules: MealRule[],
  foods: Food[]
) {
  const slotOptions = plannerSlots.map((slot) => ({
    slot: slot.key,
    options: getSlotOptions(options, slot.key, rules).slice(0, 8),
  }));

  if (slotOptions.some((entry) => entry.options.length === 0)) {
    return plannerSlots.map((slot) => ({
      slot: slot.key,
      selected: null as TemplateOption | null,
      tunedItems: [] as MealTemplateItem[],
    }));
  }

  let best:
    | {
        selections: TemplateOption[];
        score: number;
      }
    | null = null;

  function visit(index: number, selections: TemplateOption[]) {
    if (index === slotOptions.length) {
      const totals = selections.reduce<MacroTotals>(
        (acc, selection) => ({
          calories: acc.calories + selection.macros.calories,
          protein: acc.protein + selection.macros.protein,
          carbs: acc.carbs + selection.macros.carbs,
          fat: acc.fat + selection.macros.fat,
          fiber: acc.fiber + selection.macros.fiber,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
      );
      const score = scoreOption(totals, {
        calories: profile.calorie_target,
        protein: profile.protein_target,
        carbs: profile.carbs_target,
        fat: profile.fat_target,
        fiber: 0,
      });
      if (!best || score < best.score) {
        best = { selections: [...selections], score };
      }
      return;
    }

    for (const option of slotOptions[index].options) {
      selections.push(option);
      visit(index + 1, selections);
      selections.pop();
    }
  }

  visit(0, []);
  const finalBest = best as { selections: TemplateOption[]; score: number } | null;
  if (!finalBest) return [];

  const tunedItems = tuneWholeDay(finalBest.selections, foods, {
    calories: profile.calorie_target,
    protein: profile.protein_target,
    carbs: profile.carbs_target,
    fat: profile.fat_target,
    fiber: 0,
  }, rules);

  return plannerSlots.map((slot, index) => ({
    slot: slot.key,
    selected: finalBest.selections[index],
    tunedItems: tunedItems[index],
  }));
}

export function pickAlternative(
  currentTemplateId: string | null,
  slot: MealSlot,
  options: TemplateOption[],
  rules: MealRule[]
) {
  const candidates = getSlotOptions(options, slot, rules).filter(
    (option) => option.template.id !== currentTemplateId
  );

  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function chooseRemainingPlan(
  profile: Profile,
  options: TemplateOption[],
  rules: MealRule[],
  remainingSlots: MealSlot[],
  consumed: MacroTotals
) {
  let remainingTarget: MacroTotals = {
    calories: Math.max(0, profile.calorie_target - consumed.calories),
    protein: Math.max(0, profile.protein_target - consumed.protein),
    carbs: Math.max(0, profile.carbs_target - consumed.carbs),
    fat: Math.max(0, profile.fat_target - consumed.fat),
    fiber: 0,
  };

  return remainingSlots.map((slot) => {
    const slotOptions = getSlotOptions(options, slot, rules);
    const slotsLeft = Math.max(1, remainingSlots.length);
    const perMealTarget: MacroTotals = {
      calories: remainingTarget.calories / slotsLeft,
      protein: remainingTarget.protein / slotsLeft,
      carbs: remainingTarget.carbs / slotsLeft,
      fat: remainingTarget.fat / slotsLeft,
      fiber: 0,
    };
    const selected =
      [...slotOptions].sort(
        (a, b) => scoreOption(a.macros, perMealTarget) - scoreOption(b.macros, perMealTarget)
      )[0] || null;

    if (selected) {
      remainingTarget = {
        calories: Math.max(0, remainingTarget.calories - selected.macros.calories),
        protein: Math.max(0, remainingTarget.protein - selected.macros.protein),
        carbs: Math.max(0, remainingTarget.carbs - selected.macros.carbs),
        fat: Math.max(0, remainingTarget.fat - selected.macros.fat),
        fiber: 0,
      };
    }

    return { slot, selected };
  });
}

export function rebalanceMealItems(
  items: MealTemplateItem[],
  foods: Food[],
  target: MacroTotals,
  rules: MealRule[] = []
) {
  const foodById = new Map(foods.map((food) => [food.id, food]));
  const nextItems = items.map((item) => ({ ...item }));

  for (let iteration = 0; iteration < 80; iteration += 1) {
    const current = totalForItems(nextItems, foodById);
    const before = scoreOption(current, target);
    let bestItems = nextItems;
    let bestScore = before;

    for (const item of nextItems) {
      const food = foodById.get(item.food_id);
      if (!food) continue;
      const step = food.serving_mode === "grams" ? 5 : 0.25;
      for (const direction of [-1, 1]) {
        const candidateAmount = Math.max(step, roundAmount(item.amount + step * direction, step));
        if (!isAmountAllowed(item, candidateAmount, food, rules)) continue;
        if (candidateAmount === item.amount) continue;
        const candidateItems = nextItems.map((candidate) =>
          candidate.food_id === item.food_id && candidate.amount === item.amount
            ? { ...candidate, amount: candidateAmount }
            : candidate
        );
        const candidateScore = scoreOption(totalForItems(candidateItems, foodById), target);
        if (candidateScore + 0.0001 < bestScore) {
          bestScore = candidateScore;
          bestItems = candidateItems;
        }
      }
    }

    if (bestItems === nextItems) break;
    nextItems.splice(0, nextItems.length, ...bestItems);
  }

  return nextItems;
}

export function planRemainingMealsByBudget(
  profile: Profile,
  currentMeals: {
    slot: MealSlot;
    currentTemplateId: string | null;
  }[],
  options: TemplateOption[],
  rules: MealRule[],
  foods: Food[],
  consumed: MacroTotals
) {
  let remainingTarget: MacroTotals = {
    calories: Math.max(0, profile.calorie_target - consumed.calories),
    protein: Math.max(0, profile.protein_target - consumed.protein),
    carbs: Math.max(0, profile.carbs_target - consumed.carbs),
    fat: Math.max(0, profile.fat_target - consumed.fat),
    fiber: 0,
  };

  return currentMeals.map((meal, index) => {
    const slotsLeft = currentMeals.length - index;
    const perMealTarget: MacroTotals = {
      calories: remainingTarget.calories / slotsLeft,
      protein: remainingTarget.protein / slotsLeft,
      carbs: remainingTarget.carbs / slotsLeft,
      fat: remainingTarget.fat / slotsLeft,
      fiber: 0,
    };

    const candidates = getSlotOptions(options, meal.slot, rules).map((option) => ({
      option,
      tunedItems: rebalanceMealItems(
        option.items,
        foods,
        perMealTarget,
        rules.filter((rule) => rule.meal_slot === meal.slot && rule.is_active)
      ),
    }));
    const best =
      candidates.sort(
        (a, b) =>
          scoreOption(totalForItems(a.tunedItems, new Map(foods.map((food) => [food.id, food]))), perMealTarget) -
          scoreOption(totalForItems(b.tunedItems, new Map(foods.map((food) => [food.id, food]))), perMealTarget)
      )[0] || null;

    if (!best) return { slot: meal.slot, selected: null, tunedItems: [] };

    const macros = totalForItems(best.tunedItems, new Map(foods.map((food) => [food.id, food])));
    remainingTarget = {
      calories: Math.max(0, remainingTarget.calories - macros.calories),
      protein: Math.max(0, remainingTarget.protein - macros.protein),
      carbs: Math.max(0, remainingTarget.carbs - macros.carbs),
      fat: Math.max(0, remainingTarget.fat - macros.fat),
      fiber: 0,
    };

    return {
      slot: meal.slot,
      selected: best.option,
      tunedItems: best.tunedItems,
    };
  });
}

function slotTarget(profile: Profile, share: number): MacroTotals {
  return {
    calories: profile.calorie_target * share,
    protein: profile.protein_target * share,
    carbs: profile.carbs_target * share,
    fat: profile.fat_target * share,
    fiber: 0,
  };
}

function scoreOption(macros: MacroTotals, target: MacroTotals) {
  return (
    Math.abs(macros.calories - target.calories) / Math.max(target.calories, 1) +
    Math.abs(macros.protein - target.protein) / Math.max(target.protein, 1) +
    Math.abs(macros.carbs - target.carbs) / Math.max(target.carbs, 1) +
    Math.abs(macros.fat - target.fat) / Math.max(target.fat, 1)
  );
}

function totalForItems(items: MealTemplateItem[], foodById: Map<string, Food>) {
  return items.reduce<MacroTotals>(
    (totals, item) => {
      const food = foodById.get(item.food_id);
      if (!food) return totals;
      const next = calculateFoodMacros(food, item.amount);
      return {
        calories: totals.calories + next.calories,
        protein: totals.protein + next.protein,
        carbs: totals.carbs + next.carbs,
        fat: totals.fat + next.fat,
        fiber: totals.fiber + next.fiber,
      };
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  );
}

function roundAmount(value: number, step: number) {
  return Math.round(value / step) * step;
}


function tuneWholeDay(
  selections: TemplateOption[],
  foods: Food[],
  target: MacroTotals,
  rules: MealRule[]
) {
  const foodById = new Map(foods.map((food) => [food.id, food]));
  const meals = selections.map((selection) => selection.items.map((item) => ({ ...item })));

  for (let iteration = 0; iteration < 180; iteration += 1) {
    const current = totalForMeals(meals, foodById);
    const before = scoreOption(current, target);
    let bestMeals = meals;
    let bestScore = before;

    for (let mealIndex = 0; mealIndex < meals.length; mealIndex += 1) {
      for (let itemIndex = 0; itemIndex < meals[mealIndex].length; itemIndex += 1) {
        const item = meals[mealIndex][itemIndex];
        const food = foodById.get(item.food_id);
        if (!food) continue;
        const step = food.serving_mode === "grams" ? 5 : 0.25;
        for (const direction of [-1, 1]) {
          const candidateAmount = Math.max(step, roundAmount(item.amount + step * direction, step));
          if (
            !isAmountAllowed(
              item,
              candidateAmount,
              food,
              rules.filter(
                (rule) =>
                  rule.is_active &&
                  rule.meal_slot === selections[mealIndex].template.meal_slot
              )
            )
          ) {
            continue;
          }
          if (candidateAmount === item.amount) continue;
          const candidateMeals = meals.map((meal, candidateMealIndex) =>
            meal.map((candidate, candidateItemIndex) =>
              candidateMealIndex === mealIndex && candidateItemIndex === itemIndex
                ? { ...candidate, amount: candidateAmount }
                : candidate
            )
          );
          const candidateScore = scoreOption(totalForMeals(candidateMeals, foodById), target);
          if (candidateScore + 0.0001 < bestScore) {
            bestScore = candidateScore;
            bestMeals = candidateMeals;
          }
        }
      }
    }

    if (bestMeals === meals) break;
    meals.splice(0, meals.length, ...bestMeals);
  }

  return meals;
}

function totalForMeals(meals: MealTemplateItem[][], foodById: Map<string, Food>) {
  return meals.reduce<MacroTotals>(
    (totals, meal) => {
      const next = totalForItems(meal, foodById);
      return {
        calories: totals.calories + next.calories,
        protein: totals.protein + next.protein,
        carbs: totals.carbs + next.carbs,
        fat: totals.fat + next.fat,
        fiber: totals.fiber + next.fiber,
      };
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  );
}

function isAmountAllowed(
  item: MealTemplateItem,
  amount: number,
  food: Food,
  rules: MealRule[]
) {
  return rules.every((rule) => {
    if (rule.rule_type === "exact_food_amount" && rule.required_food_id === item.food_id) {
      return amount === Number(rule.amount || 0);
    }
    if (
      rule.rule_type === "minimum_category_amount" &&
      rule.target_category === food.category
    ) {
      return amount >= Number(rule.amount || 0);
    }
    return true;
  });
}
