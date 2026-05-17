import OpenAI from "openai";
import { z } from "zod";

const requestSchema = z.object({
  profile: z.object({
    calorie_target: z.number(),
    protein_target: z.number(),
    carbs_target: z.number(),
    fat_target: z.number(),
  }),
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
  rules: z.array(
    z.object({
      name: z.string(),
      meal_slot: z.enum(["breakfast", "snack_1", "lunch", "snack_2", "dinner"]),
      required_food_id: z.string(),
      is_active: z.boolean(),
    })
  ),
  style: z.string().optional(),
});

const responseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    meals: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          meal_slot: {
            type: "string",
            enum: ["breakfast", "snack_1", "lunch", "snack_2", "dinner"],
          },
          meal_name: { type: "string" },
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
        required: ["meal_slot", "meal_name", "items"],
      },
    },
  },
  required: ["meals"],
} as const;

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: "Missing OPENAI_API_KEY on the server." }, { status: 500 });
  }

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { profile, foods, rules, style } = parsed.data;
  const allowedFoodIds = new Set(foods.map((food) => food.id));
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.responses.create({
    model: process.env.OPENAI_MEAL_MODEL || "gpt-5-mini",
    input: [
      {
        role: "system",
        content:
          "You are a practical meal planner. Create meals that make culinary sense for a normal human to eat. Never create bizarre combinations such as tuna with banana or milk unless the user explicitly requests them. Use only the provided food IDs. Respect active rules. Return JSON only.",
      },
      {
        role: "user",
        content: JSON.stringify({
          goal: profile,
          style: style || "balanced, practical, varied",
          foods,
          active_rules: rules.filter((rule) => rule.is_active),
          meal_slots: ["breakfast", "snack_1", "lunch", "snack_2", "dinner"],
          instruction:
            "Create one sensible meal for each slot using only available foods. Favor normal pairings, balanced meals, and realistic quantities. Snacks can be simple. Try to approximate the full-day macros across all five meals.",
        }),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "meal_plan",
        strict: true,
        schema: responseSchema,
      },
    },
  });

  const content = response.output_text;
  const payload = JSON.parse(content) as {
    meals: {
      meal_slot: "breakfast" | "snack_1" | "lunch" | "snack_2" | "dinner";
      meal_name: string;
      items: { food_id: string; amount: number }[];
    }[];
  };

  const usesOnlyAllowedFoods = payload.meals.every((meal) =>
    meal.items.every((item) => allowedFoodIds.has(item.food_id))
  );
  if (!usesOnlyAllowedFoods) {
    return Response.json({ error: "AI returned a food that is not available." }, { status: 502 });
  }

  return Response.json(payload);
}
