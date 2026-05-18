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
