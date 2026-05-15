import { Coffee, Droplets, Flame, MoonStar } from "lucide-react";

const allowed = [
  "Water",
  "Sparkling water",
  "Black coffee",
  "Plain unsweetened tea",
  "Zero-calorie electrolytes",
  "Zero-calorie flavored water, if it does not trigger cravings",
];

const breaksFast = [
  "Bone broth",
  "Protein shake",
  "Creatine mixed with calories",
  "Almond milk",
  "Oikos",
  "Cottage cheese",
  "Eggs",
  "Fruit",
  "Chocolate",
  "Any food or drink with calories",
];

export default function FastingPage() {
  return (
    <main className="app-shell">
      <div className="mx-auto max-w-5xl">
        <p className="eyebrow mb-2 text-xs font-semibold">Recovery mode</p>
        <h1 className="mb-6 text-4xl font-bold">Fasting Guide</h1>

        <div className="surface mb-4 rounded-3xl p-5">
          <div className="mb-4 flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-lime-300 text-black">
              <MoonStar className="h-5 w-5" />
            </span>
            <div>
              <div className="muted text-sm">Schedule</div>
              <div className="text-xl font-semibold">10:00 am – 8:00 pm eating window</div>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Window label="Eating window" value="10:00 am – 8:00 pm" />
            <Window label="Fasting window" value="8:00 pm – 10:00 am" />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <ListCard title="Allowed During Fasting" icon={Droplets} items={allowed} tone="lime" />
          <ListCard title="Breaks the Fast" icon={Flame} items={breaksFast} tone="rose" />
        </div>

        <div className="surface mt-4 rounded-3xl p-5">
          <div className="mb-3 flex items-center gap-3">
            <Coffee className="h-5 w-5 text-cyan-300" />
            <h2 className="text-xl font-semibold">Important note</h2>
          </div>
          <p className="muted">
            Bone broth can be useful for appetite control, but it has calories, so keep it inside the eating window.
          </p>
        </div>
      </div>
    </main>
  );
}

function Window({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-strong rounded-2xl p-4">
      <div className="muted text-sm">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function ListCard({
  title,
  items,
  icon: Icon,
  tone,
}: {
  title: string;
  items: string[];
  icon: typeof Droplets;
  tone: "lime" | "rose";
}) {
  return (
    <section className="surface rounded-3xl p-5">
      <div className="mb-4 flex items-center gap-3">
        <Icon className={tone === "lime" ? "h-5 w-5 text-lime-300" : "h-5 w-5 text-rose-300"} />
        <h2 className="text-xl font-semibold">{title}</h2>
      </div>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item} className="surface-strong rounded-2xl px-4 py-3 text-sm text-slate-200">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
