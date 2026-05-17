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

  const calorieFloor = input.sex === "female" ? 1200 : 1500;
  const calorieTarget = Math.round(Math.max(calorieFloor, tdee - requiredDailyDeficit));
  const proteinTarget = Math.round(input.weightLb * 0.8);
  const fatTarget = Math.round(Math.max(40, input.weightLb * 0.3));
  const carbsTarget = Math.round(
    Math.max(0, (calorieTarget - proteinTarget * 4 - fatTarget * 9) / 4)
  );

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    requiredDailyDeficit: Math.round(requiredDailyDeficit),
    calorieTarget,
    proteinTarget,
    carbsTarget,
    fatTarget,
  };
}
