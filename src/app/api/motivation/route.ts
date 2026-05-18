import OpenAI from "openai";
import { z } from "zod";

const requestSchema = z.object({
  event: z.enum(["meal_completed", "day_completed", "fast_completed", "progress_on_track", "progress_needs_attention"]),
  profile_name: z.string().optional(),
  context: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return Response.json({ message: fallbackMessage("meal_completed") });
    }

    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }

    const { event, profile_name, context } = parsed.data;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: process.env.OPENAI_MOTIVATION_MODEL || "gpt-5-nano",
      input: [
        {
          role: "system",
          content:
            "Write one short motivational message for a fitness app. Maximum 18 words. Warm, specific, not cheesy, no hashtags, no emojis unless the user name suggests a personal tone.",
        },
        {
          role: "user",
          content: JSON.stringify({
            event,
            profile_name,
            context,
          }),
        },
      ],
    });

    const message = response.output_text.trim();
    return Response.json({ message: message || fallbackMessage(event) });
  } catch {
    return Response.json({ message: fallbackMessage("meal_completed") });
  }
}

function fallbackMessage(event: z.infer<typeof requestSchema>["event"]) {
  switch (event) {
    case "day_completed":
      return "You closed the day with discipline. That is how momentum gets built.";
    case "fast_completed":
      return "Fast completed cleanly. Quiet consistency like this changes the whole curve.";
    case "progress_on_track":
      return "You are on track. Keep repeating the boring wins that make the result inevitable.";
    case "progress_needs_attention":
      return "A small correction now beats a big reset later. Tighten the next few days.";
    default:
      return "Good work. One clean choice compounds into the next.";
  }
}
