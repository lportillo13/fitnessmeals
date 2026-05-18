export async function fetchMotivation(
  event:
    | "meal_completed"
    | "day_completed"
    | "fast_completed"
    | "progress_on_track"
    | "progress_needs_attention",
  profileName?: string,
  context?: Record<string, string | number | boolean>
) {
  try {
    const response = await fetch("/api/motivation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        profile_name: profileName,
        context,
      }),
    });
    const payload = (await response.json()) as { message?: string };
    return payload.message || "";
  } catch {
    return "";
  }
}

const positiveMotivations = [
  "Nice work. One food closer.",
  "That choice keeps the day moving in the right direction.",
  "Clean execution. Keep stacking these.",
  "Good call. Consistency is getting louder.",
  "Another rep for your discipline.",
  "That is how the plan becomes real.",
  "Strong choice. Stay in rhythm.",
  "Small win logged. Big result loading.",
  "You kept the promise to yourself.",
  "Momentum likes this version of you.",
  "Good work. The curve bends one choice at a time.",
  "That was a vote for the goal.",
  "Solid. Keep the chain unbroken.",
  "You are doing the quiet work that compounds.",
  "Excellent. The boring wins are winning.",
  "That meal moved you forward.",
  "Right on plan. Keep the engine warm.",
  "Another clean decision in the bank.",
  "You are making the next choice easier.",
  "Good discipline. Nothing flashy, just effective.",
  "That is progress wearing ordinary clothes.",
  "One more box checked. Keep going.",
  "Sharp work. The day is taking shape.",
  "You stayed aligned. That matters.",
  "Good. The system is working because you are using it.",
  "That choice belongs to the person you are becoming.",
  "Steady hands. Strong outcome.",
  "Nice. Keep feeding the streak.",
  "You are building trust with yourself.",
  "Another clean move. Stay with it.",
];

export function instantMotivation(
  event:
    | "meal_completed"
    | "day_completed"
    | "fast_completed"
    | "progress_on_track"
    | "progress_needs_attention"
) {
  switch (event) {
    case "day_completed":
      return randomPositiveMotivation();
    case "fast_completed":
      return randomPositiveMotivation();
    case "progress_on_track":
      return randomPositiveMotivation();
    case "progress_needs_attention":
      return "Generating recommendation...";
    default:
      return randomPositiveMotivation();
  }
}

function randomPositiveMotivation() {
  return positiveMotivations[Math.floor(Math.random() * positiveMotivations.length)];
}
