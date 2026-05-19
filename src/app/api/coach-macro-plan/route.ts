import OpenAI from "openai";
import { z } from "zod";

const requestSchema = z.object({
  profile: z.object({
    name: z.string(),
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
    goal_instruction: z.string(),
  }),
  formula_targets: z.object({
    bmr: z.number(),
    tdee: z.number(),
    requiredDailyDeficit: z.number(),
    calorieTarget: z.number(),
    proteinTarget: z.number(),
    carbsTarget: z.number(),
    fatTarget: z.number(),
  }),
});

const coachPlanSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    plan_bmr: { type: "number" },
    plan_tdee: { type: "number" },
    plan_daily_deficit: { type: "number" },
    calorie_target: { type: "number" },
    protein_target: { type: "number" },
    carbs_target: { type: "number" },
    fat_target: { type: "number" },
    summary: { type: "string" },
    coach_notes: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: { type: "string" },
    },
    steps: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: { type: "string" },
    },
  },
  required: [
    "plan_bmr",
    "plan_tdee",
    "plan_daily_deficit",
    "calorie_target",
    "protein_target",
    "carbs_target",
    "fat_target",
    "summary",
    "coach_notes",
    "steps",
  ],
} as const;

const responseSchema = z.object({
  plan_bmr: z.number().min(800).max(4000),
  plan_tdee: z.number().min(1000).max(6000),
  plan_daily_deficit: z.number().min(0).max(1500),
  calorie_target: z.number().min(1000).max(5000),
  protein_target: z.number().min(40).max(350),
  carbs_target: z.number().min(0).max(600),
  fat_target: z.number().min(25).max(250),
  summary: z.string(),
  coach_notes: z.array(z.string()).min(2).max(4),
  steps: z.array(z.string()).min(3).max(5),
});

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return Response.json({ error: "Missing OPENAI_API_KEY on the server." }, { status: 500 });
    }

    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }

    const model = process.env.OPENAI_COACH_MODEL || "gpt-5.5";
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model,
      reasoning: { effort: "high" },
      input: [
        {
          role: "system",
          content:
            "You are an evidence-informed nutrition coach creating practical macro targets. Keep recommendations conservative, explain tradeoffs briefly, and do not provide medical diagnosis. Return JSON only.",
        },
        {
          role: "user",
          content: JSON.stringify({
            profile: parsed.data.profile,
            formula_targets: parsed.data.formula_targets,
            instruction:
              "Review the formula targets and create a daily macro plan for fat loss while preserving lean mass. You may adjust the formula targets only when the goal timeline, activity, body-fat data, or calorie floor makes an adjustment practical. Keep calories realistic, protein high, fats adequate, and carbs as the remaining budget. Return rounded whole-number targets.",
          }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "coach_macro_plan",
          strict: true,
          schema: coachPlanSchema,
        },
      },
    });

    const coachPlan = responseSchema.parse(JSON.parse(response.output_text));

    return Response.json({
      model,
      plan: {
        ...coachPlan,
        plan_bmr: Math.round(coachPlan.plan_bmr),
        plan_tdee: Math.round(coachPlan.plan_tdee),
        plan_daily_deficit: Math.round(coachPlan.plan_daily_deficit),
        calorie_target: Math.round(coachPlan.calorie_target),
        protein_target: Math.round(coachPlan.protein_target),
        carbs_target: Math.round(coachPlan.carbs_target),
        fat_target: Math.round(coachPlan.fat_target),
      },
    });
  } catch (error) {
    console.error("coach-macro-plan route failed", error);
    const message =
      error instanceof Error ? error.message : "Unknown server error during coach plan generation.";
    return Response.json({ error: message }, { status: 500 });
  }
}
