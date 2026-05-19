import type { Profile } from "./types";

export type CoachTargets = {
  bmr: number;
  tdee: number;
  requiredDailyDeficit: number;
  calorieTarget: number;
  proteinTarget: number;
  carbsTarget: number;
  fatTarget: number;
};

type CoachInput = Pick<
  Profile,
  | "goal_date"
  | "goal_loss_lb"
  | "steps_per_day"
  | "training_days_per_week"
  | "weight_lb"
  | "goal_instruction"
> & {
  name?: string;
};

export function buildCoachPlan(input: CoachInput, targets: CoachTargets) {
  const today = new Date();
  const goalDate = new Date(input.goal_date);
  const days = Math.max(
    1,
    Math.ceil((goalDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  );
  const weeks = Math.max(1, days / 7);
  const weeklyLoss = input.goal_loss_lb / weeks;
  const calorieGap = Math.max(0, targets.tdee - targets.calorieTarget);
  const safePace =
    weeklyLoss <= 0.75
      ? "comfortable"
      : weeklyLoss <= 1.25
        ? "focused"
        : "aggressive";
  const stepTarget =
    input.steps_per_day >= 9000
      ? input.steps_per_day
      : input.steps_per_day >= 7000
        ? 9000
        : input.steps_per_day + 2000;

  return {
    days,
    weeks: Math.round(weeks * 10) / 10,
    weeklyLoss: Math.round(weeklyLoss * 10) / 10,
    calorieGap,
    safePace,
    steps: [
      `Hit ${targets.calorieTarget} calories with ${targets.proteinTarget} g protein, ${targets.carbsTarget} g carbs, and ${targets.fatTarget} g fat as the daily baseline.`,
      `Average ${stepTarget.toLocaleString()} steps per day; add the steps gradually if the current baseline is lower.`,
      `Train ${input.training_days_per_week} days weekly and keep protein high on rest days so the deficit comes mostly from fat loss.`,
      "Check the 7-day average weight each week; adjust calories by 100 to 150 only if two weekly averages stall.",
    ],
    coachNotes: [
      `${Math.round(days)} days remain, which asks for about ${Math.round(weeklyLoss * 10) / 10} lb per week.`,
      `The planned calorie gap is about ${Math.round(calorieGap)} calories per day before exercise variance.`,
      safePace === "aggressive"
        ? "This timeline is aggressive, so consistency matters more than cutting lower."
        : "This timeline is workable if the macro targets are hit most days.",
    ],
    instruction:
      input.goal_instruction?.trim() ||
      "Build the day around simple meals, high protein, controlled portions, and repeatable habits.",
  };
}
