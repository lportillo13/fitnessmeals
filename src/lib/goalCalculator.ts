type GoalInput = {
  age: number;
  sex: "female" | "male";
  weightLb: number;
  heightIn: number;
  trainingDaysPerWeek: number;
  stepsPerDay: number;
  goalLossLb: number;
  goalDate: string;
};

const defaultProfile = {
  age: 31,
  sex: "female",
  weightLb: 157,
  heightIn: 63,
  bodyFatPercent: 32,
  trainingDaysPerWeek: 4,
  stepsPerDay: 5000,
  goalLossLb: 15,
  goalDate: "2026-08-01",
};

export function calculateBmr({
  age,
  sex,
  weightLb,
  heightIn,
}: Pick<GoalInput, "age" | "sex" | "weightLb" | "heightIn">) {
  const weightKg = weightLb * 0.453592;
  const heightCm = heightIn * 2.54;

  const adjustment = sex === "female" ? -161 : 5;

  return 10 * weightKg + 6.25 * heightCm - 5 * age + adjustment;
}

export function getActivityFactor(trainingDaysPerWeek: number, stepsPerDay: number) {
  if (trainingDaysPerWeek >= 4 && stepsPerDay >= 8000) return 1.5;
  if (trainingDaysPerWeek >= 3 && stepsPerDay >= 6000) return 1.4;
  if (trainingDaysPerWeek >= 3) return 1.35;
  return 1.25;
}

export function calculateGoalTargets(input: GoalInput) {
  const bmr = calculateBmr(input);
  const activityFactor = getActivityFactor(
    input.trainingDaysPerWeek,
    input.stepsPerDay
  );

  const tdee = bmr * activityFactor;

  const today = new Date();
  const targetDate = new Date(input.goalDate);
  const daysUntilGoal = Math.max(
    1,
    Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  );

  const requiredDailyDeficit = (input.goalLossLb * 3500) / daysUntilGoal;

  const calorieTarget = Math.round(
    Math.max(1300, Math.min(1550, tdee - requiredDailyDeficit))
  );

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    requiredDailyDeficit: Math.round(requiredDailyDeficit),
    calorieTarget,
    proteinTarget: 130,
    carbsTarget: 135,
    fatTarget: 45,
  };
}