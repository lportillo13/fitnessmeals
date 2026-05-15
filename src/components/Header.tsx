"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Apple, Dumbbell, Flame, House, Repeat2, UserRound } from "lucide-react";

const navItems = [
  { label: "Home", href: "/", icon: House },
  { label: "Calculator", href: "/calculator", icon: Dumbbell },
  { label: "Foods", href: "/foods", icon: Apple },
  { label: "Swaps", href: "/swaps", icon: Repeat2 },
  { label: "Fasting", href: "/fasting", icon: Flame },
  { label: "Profile", href: "/profile", icon: UserRound },
];

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/35 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between">
        <Link href="/" className="flex items-center gap-3 text-xl font-bold">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-lime-300 text-black shadow-[0_0_24px_rgba(124,255,79,0.45)]">
            <Dumbbell className="h-5 w-5" />
          </span>
          <span>Meal Calculator</span>
        </Link>

        <nav className="flex gap-2 overflow-x-auto pb-1 md:pb-0">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition ${
                  isActive
                    ? "bg-lime-300 text-black shadow-[0_0_20px_rgba(124,255,79,0.35)]"
                    : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
