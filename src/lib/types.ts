export type Food = {
  id: string;
  user_id: string | null;
  name: string;
  brand: string | null;
  category: "protein" | "carb" | "fat" | "fruit" | "snack" | "drink" | "other";
  serving_mode: "unit" | "grams";
  serving_label: string;
  base_grams: number | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  is_public: boolean;
};

export type MealSlot = "breakfast" | "snack_1" | "lunch" | "snack_2" | "dinner";

export type SelectedFood = {
  food: Food;
  amount: number;
  mealSlot: MealSlot;
};

export type MacroTotals = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
};

export type Profile = {
  id: string;
  name: string;
  age: number;
  sex: "female" | "male";
  weight_lb: number;
  height_in: number;
  training_days_per_week: number;
  steps_per_day: number;
  goal_loss_lb: number;
  goal_date: string;
  calorie_target: number;
  protein_target: number;
  carbs_target: number;
  fat_target: number;
};

export type MealTemplate = {
  id: string;
  profile_id: string | null;
  name: string;
};

export type MealTemplateItem = {
  id: string;
  meal_template_id: string;
  food_id: string;
  amount: number;
};
