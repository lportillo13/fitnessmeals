import OpenAI from "openai";
import { z } from "zod";

const requestSchema = z.object({
  profile: z.object({
    age: z.number(),
    sex: z.enum(["female", "male"]),
    weight_lb: z.number(),
    height_in: z.number(),
    training_days_per_week: z.number(),
    steps_per_day: z.number(),
    goal_loss_lb: z.number(),
    current_body_fat_percentage: z.number().nullable().optional(),
    goal_body_fat_percentage: z.number().nullable().optional(),
    goal_date: z.string(),
    calorie_target: z.number(),
    protein_target: z.number(),
    carbs_target: z.number(),
    fat_target: z.number(),
  }),
  goal_instruction: z.string().min(3),
  meal_slot: z.enum(["breakfast", "snack_1", "lunch", "dinner"]),
  count: z.number().int().min(1).max(1),
  foods: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      category: z.string(),
      serving_mode: z.enum(["unit", "grams"]),
      serving_label: z.string(),
      base_grams: z.number().nullable(),
      calories: z.number(),
      protein_g: z.number(),
      carbs_g: z.number(),
      fat_g: z.number(),
      allowed_meal_slots: z.array(z.enum(["breakfast", "snack_1", "lunch", "snack_2", "dinner"])),
    })
  ),
});

type GeneratedMeal = {
  meal_name: string;
  meal_slot: "breakfast" | "snack_1" | "lunch" | "dinner";
  items: { food_id: string; amount: number }[];
};

const mealBatchSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    meals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          meal_name: { type: "string" },
          meal_slot: {
            type: "string",
            enum: ["breakfast", "snack_1", "lunch", "dinner"],
          },
          items: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                food_id: { type: "string" },
                amount: { type: "number", minimum: 0.25 },
              },
              required: ["food_id", "amount"],
            },
          },
        },
        required: ["meal_name", "meal_slot", "items"],
      },
    },
  },
  required: ["meals"],
} as const;

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return Response.json({ error: "Missing OPENAI_API_KEY on the server." }, { status: 500 });
    }

    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }

    const { profile, foods, goal_instruction, meal_slot, count } = parsed.data;
    const planningFoods = foods.filter((food) => food.category !== "drink");
    const allowedFoodIds = new Set(planningFoods.map((food) => food.id));
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const slotFoods = planningFoods.filter((food) => food.allowed_meal_slots.includes(meal_slot));
    const response = await client.responses.create({
      model: process.env.OPENAI_MEAL_MODEL || "gpt-5-mini",
      input: [
        {
          role: "system",
          content:
            "You are a practical nutrition planner. Build reusable meals that make culinary sense, use only the available food IDs, and support the user's stated goal. Consider both current and goal body-fat percentages when they are provided, alongside weight, targets, and timeline. Return JSON only.",
        },
        {
          role: "user",
          content: JSON.stringify({
            instruction: goal_instruction,
            profile,
            foods: slotFoods,
            required_output: `Create exactly ${count} varied, realistic meals. Every meal must use meal_slot ${meal_slot}. Use only available foods allowed for that meal slot. Do not include drinks; drinks are added manually by the user. Never use tiny gram quantities: proteins must be at least 50 g, carbs at least 30 g, fats at least 5 g, and other gram foods at least 10 g. Use at most one carb food per meal. For lunch and dinner, total protein-food quantity must be between 100 and 150 grams. Quantities should help the whole day fit the macro targets.`,
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: `${meal_slot}_batch`,
          strict: true,
          schema: {
            ...mealBatchSchema,
            properties: {
              meals: {
                ...mealBatchSchema.properties.meals,
                minItems: count,
                maxItems: count,
              },
            },
          },
        },
      },
    });

    const meals = (JSON.parse(response.output_text) as { meals: GeneratedMeal[] }).meals;

    const foodById = new Map(planningFoods.map((food) => [food.id, food]));
    const usesOnlyAllowedFoods = meals.every((meal) =>
      meal.items.every(
        (item) =>
          allowedFoodIds.has(item.food_id) &&
          foodById.get(item.food_id)?.allowed_meal_slots.includes(meal.meal_slot)
      )
    );
    const followsMealRules = meals.every((meal) => {
      const carbCount = meal.items.filter(
        (item) => foodById.get(item.food_id)?.category === "carb"
      ).length;
      const proteinAmount = meal.items.reduce((sum, item) => {
        return foodById.get(item.food_id)?.category === "protein" ? sum + item.amount : sum;
      }, 0);
      const invalidProteinAmount =
        (meal.meal_slot === "lunch" || meal.meal_slot === "dinner") &&
        (proteinAmount < 100 || proteinAmount > 150);
      const hasUnrealisticAmounts = meal.items.some((item) => {
        const food = foodById.get(item.food_id);
        if (!food) return true;
        return food.serving_mode === "grams" && item.amount < minimumAmountForFood(food.category);
      });
      return carbCount <= 1 && !invalidProteinAmount && !hasUnrealisticAmounts;
    });

    if (
      !usesOnlyAllowedFoods ||
      meals.length !== count ||
      !followsMealRules
    ) {
      return Response.json(
        {
          error: "AI returned an invalid meal plan.",
          details: {
            usesOnlyAllowedFoods,
            followsMealRules,
          },
        },
        { status: 502 }
      );
    }

    return Response.json({
      meals,
    });
  } catch (error) {
    console.error("nutrition-plan route failed", error);
    const message =
      error instanceof Error ? error.message : "Unknown server error during plan generation.";
    return Response.json({ error: message }, { status: 500 });
  }
}

function minimumAmountForFood(category: string) {
  if (category === "protein") return 50;
  if (category === "carb") return 30;
  if (category === "fat") return 5;
  return 10;
}
