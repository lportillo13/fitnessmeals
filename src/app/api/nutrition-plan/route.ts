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
    })
  ),
});

const responseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    plan_summary: { type: "string" },
    meals: {
      type: "array",
      minItems: 18,
      maxItems: 18,
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
  required: ["plan_summary", "meals"],
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
            foods,
            required_output:
              "Create exactly 5 breakfasts, 5 lunches, 5 dinners, and 3 snacks. Snacks should use meal_slot snack_1. Keep meals varied, realistic, and reusable. Quantities should help the whole day fit the macro targets.",
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "nutrition_plan",
          strict: true,
          schema: responseSchema,
        },
      },
    });

    const payload = JSON.parse(response.output_text) as {
      plan_summary: string;
      meals: {
        meal_name: string;
        meal_slot: "breakfast" | "snack_1" | "lunch" | "dinner";
        items: { food_id: string; amount: number }[];
      }[];
    };

    const counts = payload.meals.reduce<Record<string, number>>((acc, meal) => {
      acc[meal.meal_slot] = (acc[meal.meal_slot] || 0) + 1;
      return acc;
    }, {});
    const usesOnlyAllowedFoods = payload.meals.every((meal) =>
      meal.items.every((item) => allowedFoodIds.has(item.food_id))
    );

    if (
      !usesOnlyAllowedFoods ||
      counts.breakfast !== 5 ||
      counts.lunch !== 5 ||
      counts.dinner !== 5 ||
      counts.snack_1 !== 3
    ) {
      return Response.json({ error: "AI returned an invalid meal plan." }, { status: 502 });
    }

    return Response.json(payload);
  } catch (error) {
    console.error("nutrition-plan route failed", error);
    const message =
      error instanceof Error ? error.message : "Unknown server error during plan generation.";
    return Response.json({ error: message }, { status: 500 });
  }
}
