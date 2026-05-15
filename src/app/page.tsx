import Image from "next/image";
import Link from "next/link";
import { Apple, ArrowRight, Dumbbell, Flame, Repeat2, UserRound } from "lucide-react";

const cards = [
  { title: "Daily Calculator", description: "Build meals and track macros.", href: "/calculator", icon: Dumbbell },
  { title: "Foods", description: "Browse serving-based foods.", href: "/foods", icon: Apple },
  { title: "Macro Swaps", description: "Trade foods without drifting off target.", href: "/swaps", icon: Repeat2 },
  { title: "Fasting", description: "Keep the eating window clean.", href: "/fasting", icon: Flame },
  { title: "Profile", description: "Tune calories and body goals.", href: "/profile", icon: UserRound },
];

export default function HomePage() {
  return (
    <main className="app-shell">
      <div className="mx-auto max-w-6xl">
        <section className="surface neon-ring mb-6 overflow-hidden rounded-[2rem] p-6 md:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_0.82fr] lg:items-center">
            <div>
              <h1 className="max-w-3xl text-4xl font-bold tracking-tight md:text-6xl">
                Cut cleaner. Eat smarter. Stay on target.
              </h1>
              <div className="mt-5 inline-flex rounded-full border border-lime-300/20 bg-lime-300/10 px-4 py-2 text-sm text-lime-100">
                Jazmin, you are stronger than you think — one good choice at a time. 💚
              </div>
            </div>

            <div className="space-y-4">
              <div className="overflow-hidden rounded-[1.75rem] border border-white/10">
                <Image
                  src="/capybara-hero.png"
                  alt="Capybara with a meal bowl and dumbbell"
                  width={1536}
                  height={1024}
                  className="h-auto w-full"
                  priority
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat label="Protein target" value="130g" />
                <Stat label="Calories" value="1500" />
                <Stat label="Window" value="10am–8pm" />
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map(({ title, description, href, icon: Icon }) => (
            <Link
              key={title}
              href={href}
              className="surface group rounded-3xl p-5 transition hover:-translate-y-1 hover:border-lime-300/30 hover:bg-white/8"
            >
              <div className="mb-6 flex items-center justify-between">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/6 text-lime-300">
                  <Icon className="h-6 w-6" />
                </span>
                <ArrowRight className="h-5 w-5 text-slate-500 transition group-hover:translate-x-1 group-hover:text-lime-300" />
              </div>
              <h2 className="text-xl font-semibold">{title}</h2>
              <p className="muted mt-2 text-sm">{description}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-strong rounded-2xl p-4">
      <div className="muted text-xs uppercase tracking-[0.18em]">{label}</div>
      <div className="mt-2 text-2xl font-semibold neon-text">{value}</div>
    </div>
  );
}
