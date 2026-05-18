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
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 2200);
    const response = await fetch("/api/motivation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        event,
        profile_name: profileName,
        context,
      }),
    });
    window.clearTimeout(timeoutId);
    const payload = (await response.json()) as { message?: string };
    return payload.message || "";
  } catch {
    return "";
  }
}

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
      return "Day complete. That is a serious win.";
    case "fast_completed":
      return "Fast completed cleanly. Strong work.";
    case "progress_on_track":
      return "You are on track. Keep the rhythm.";
    case "progress_needs_attention":
      return "Small correction needed. Tighten the next few days.";
    default:
      return "Nice work. One food closer.";
  }
}
