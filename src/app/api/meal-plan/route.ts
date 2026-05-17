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
      allowed_meal_slots: z.array(z.enum(["breakfast", "snack_1", "lunch", "snack_2", "dinner"])),
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
  meal_slot: z.enum(["breakfast", "snack_1", "lunch", "snack_2", "dinner"]),
  style: z.string().optional(),
});

const responseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
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
  required: ["meal_name", "items"],
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

    const { profile, foods, rules, meal_slot, style } = parsed.data;
    const slotFoods = foods.filter((food) => food.allowed_meal_slots.includes(meal_slot));
    const allowedFoodIds = new Set(slotFoods.map((food) => food.id));
    const slotRules = rules.filter((rule) => rule.is_active && rule.meal_slot === meal_slot);
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: process.env.OPENAI_MEAL_MODEL || "gpt-5-mini",
      input: [
        {
          role: "system",
          content:
            "You are a practical meal planner. Create one meal that makes culinary sense for a normal human to eat. Never create bizarre combinations such as tuna with banana or milk unless the user explicitly requests them. Use only the provided food IDs. Respect active rules. Return JSON only.",
        },
        {
          role: "user",
          content: JSON.stringify({
            meal_slot,
            day_goal: profile,
            style: style || "balanced, practical, varied",
            foods: slotFoods,
            active_rules_for_this_slot: slotRules,
            instruction:
              "Create one sensible reusable meal for this slot using only available foods. Use realistic quantities and choose foods that belong together. Never use tiny gram quantities: proteins must be at least 50 g, carbs at least 30 g, fats at least 5 g, and other gram foods at least 10 g. Use at most one carb food. For lunch and dinner, total protein-food quantity must be between 100 and 150 grams. Make it useful inside the user's daily goal.",
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "meal_template",
          strict: true,
          schema: responseSchema,
        },
      },
    });

    const payload = JSON.parse(response.output_text) as {
      meal_name: string;
      items: { food_id: string; amount: number }[];
    };

    const usesOnlyAllowedFoods = payload.items.every((item) => allowedFoodIds.has(item.food_id));
    const slotFoodById = new Map(slotFoods.map((food) => [food.id, food]));
    const carbCount = payload.items.filter(
      (item) => slotFoodById.get(item.food_id)?.category === "carb"
    ).length;
    const proteinAmount = payload.items.reduce((sum, item) => {
      return slotFoodById.get(item.food_id)?.category === "protein"
        ? sum + item.amount
        : sum;
    }, 0);
    const invalidProteinAmount =
      (meal_slot === "lunch" || meal_slot === "dinner") &&
      (proteinAmount < 100 || proteinAmount > 150);
    const hasUnrealisticAmounts = payload.items.some((item) => {
      const food = slotFoodById.get(item.food_id);
      if (!food) return true;
      return food.serving_mode === "grams" && item.amount < minimumAmountForFood(food.category);
    });
    if (!usesOnlyAllowedFoods || carbCount > 1 || invalidProteinAmount || hasUnrealisticAmounts) {
      return Response.json({ error: "AI returned a meal that does not follow the planning rules." }, { status: 502 });
    }

    return Response.json(payload);
  } catch (error) {
    console.error("meal-plan route failed", error);
    const message =
      error instanceof Error ? error.message : "Unknown server error during AI meal generation.";
    return Response.json({ error: message }, { status: 500 });
  }
}

function minimumAmountForFood(category: string) {
  if (category === "protein") return 50;
  if (category === "carb") return 30;
  if (category === "fat") return 5;
  return 10;
}
