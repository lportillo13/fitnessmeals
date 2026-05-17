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
    goal_date: z.string(),
    calorie_target: z.number(),
    protein_target: z.number(),
    carbs_target: z.number(),
    fat_target: z.number(),
  }),
  goal_instruction: z.string().min(3),
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

    const { profile, foods, goal_instruction } = parsed.data;
    const allowedFoodIds = new Set(foods.map((food) => food.id));
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const batchRequests = [
      { meal_slot: "breakfast" as const, count: 5, label: "breakfasts" },
      { meal_slot: "lunch" as const, count: 5, label: "lunches" },
      { meal_slot: "dinner" as const, count: 5, label: "dinners" },
      { meal_slot: "snack_1" as const, count: 3, label: "snacks" },
    ];

    const mealBatches = await Promise.all(
      batchRequests.map(async ({ meal_slot, count, label }) => {
        const slotFoods = foods.filter((food) => food.allowed_meal_slots.includes(meal_slot));
        const response = await client.responses.create({
          model: process.env.OPENAI_MEAL_MODEL || "gpt-5-mini",
          input: [
            {
              role: "system",
              content:
                "You are a practical nutrition planner. Build reusable meals that make culinary sense, use only the available food IDs, and support the user's stated goal. Return JSON only.",
            },
            {
              role: "user",
              content: JSON.stringify({
                instruction: goal_instruction,
                profile,
                foods: slotFoods,
                required_output: `Create exactly ${count} varied, realistic ${label}. Every meal must use meal_slot ${meal_slot}. Use only available foods allowed for that meal slot. Use at most one carb food per meal. For lunch and dinner, total protein-food quantity must be between 100 and 150 grams. Quantities should help the whole day fit the macro targets.`,
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

        const payload = JSON.parse(response.output_text) as { meals: GeneratedMeal[] };
        return payload.meals;
      })
    );

    const meals = mealBatches.flat();

    const counts = meals.reduce<Record<string, number>>((acc, meal) => {
      acc[meal.meal_slot] = (acc[meal.meal_slot] || 0) + 1;
      return acc;
    }, {});
    const foodById = new Map(foods.map((food) => [food.id, food]));
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
      return carbCount <= 1 && !invalidProteinAmount;
    });

    if (
      !usesOnlyAllowedFoods ||
      counts.breakfast !== 5 ||
      counts.lunch !== 5 ||
      counts.dinner !== 5 ||
      counts.snack_1 !== 3 ||
      !followsMealRules
    ) {
      return Response.json({ error: "AI returned an invalid meal plan." }, { status: 502 });
    }

    return Response.json({
      plan_summary:
        "Built a fresh goal-based meal library from your available foods and profile targets.",
      meals,
    });
  } catch (error) {
    console.error("nutrition-plan route failed", error);
    const message =
      error instanceof Error ? error.message : "Unknown server error during plan generation.";
    return Response.json({ error: message }, { status: 500 });
  }
}
