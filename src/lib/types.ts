export type Food = {
  id: string;
  user_id: string | null;
  profile_id: string | null;
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
  is_available: boolean;
  max_amount: number | null;
  allowed_meal_slots: MealSlot[];
};

export type MealSlot = "breakfast" | "snack_1" | "lunch" | "snack_2" | "dinner";

export type SelectedFood = {
  food: Food;
  amount: number;
  amountMode?: "serving" | "grams";
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
  current_body_fat_percentage: number | null;
  goal_body_fat_percentage: number | null;
  goal_date: string;
  goal_instruction: string | null;
  plan_bmr: number | null;
  plan_tdee: number | null;
  plan_daily_deficit: number | null;
  plan_start_date: string | null;
  plan_start_weight_lb: number | null;
  calorie_target: number;
  protein_target: number;
  carbs_target: number;
  fat_target: number;
};

export type MealTemplate = {
  id: string;
  profile_id: string | null;
  name: string;
  meal_slot: MealSlot | null;
  is_default_daily: boolean;
};

export type MealTemplateItem = {
  id: string;
  meal_template_id: string;
  food_id: string;
  amount: number;
  amount_mode?: "serving" | "grams" | null;
};

export type MealRule = {
  id: string;
  profile_id: string | null;
  name: string;
  meal_slot: MealSlot;
  rule_type: "required_food" | "minimum_category_amount" | "exact_food_amount";
  required_food_id: string | null;
  target_category: Food["category"] | null;
  amount: number | null;
  is_active: boolean;
};

export type DailyPlan = {
  id: string;
  profile_id: string;
  plan_date: string;
  generated_at: string;
};

export type DailyPlanMeal = {
  id: string;
  daily_plan_id: string;
  meal_slot: MealSlot;
  meal_template_id: string | null;
  meal_name: string;
  completed: boolean;
};

export type DailyPlanItem = {
  id: string;
  daily_plan_meal_id: string;
  food_id: string;
  amount: number;
  amount_mode?: "serving" | "grams" | null;
  completed?: boolean;
};

export type ProgressLog = {
  id: string;
  profile_id: string;
  log_date: string;
  weight_lb: number;
  body_fat_percentage: number | null;
  note: string | null;
  created_at: string;
};
