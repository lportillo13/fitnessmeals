import type { MacroTotals } from "@/lib/types";
import { Beef, Flame, Wheat, Droplets } from "lucide-react";

type Props = {
  totals: MacroTotals;
  targets: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
};

function percent(current: number, target: number) {
  if (!target) return 0;
  return Math.min(100, Math.round((current / target) * 100));
}

export default function MacroSummary({ totals, targets }: Props) {
  const rows = [
    { label: "Calories", current: totals.calories, target: targets.calories, unit: "", icon: Flame, color: "from-lime-300 to-emerald-400" },
    { label: "Protein", current: totals.protein, target: targets.protein, unit: "g", icon: Beef, color: "from-cyan-300 to-sky-400" },
    { label: "Net Carbs", current: totals.carbs, target: targets.carbs, unit: "g", icon: Wheat, color: "from-fuchsia-300 to-violet-400" },
    { label: "Fat", current: totals.fat, target: targets.fat, unit: "g", icon: Droplets, color: "from-amber-300 to-orange-400" },
  ];

  return (
    <div className="surface w-full max-w-full overflow-hidden rounded-3xl p-5">
      <p className="eyebrow mb-2 text-xs font-semibold">Live dashboard</p>
      <h2 className="mb-5 text-2xl font-semibold">Daily Macros</h2>

      <div className="space-y-4">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="mb-2 flex justify-between text-sm">
              <span className="flex items-center gap-2 text-slate-200">
                <row.icon className="h-4 w-4" />
                {row.label}
              </span>
              <span>
                {Math.round(row.current)}
                {row.unit} / {row.target}
                {row.unit}
              </span>
            </div>

            <div className="h-3 rounded-full bg-white/8">
              <div
                className={`h-3 rounded-full bg-gradient-to-r ${row.color}`}
                style={{ width: `${percent(row.current, row.target)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
