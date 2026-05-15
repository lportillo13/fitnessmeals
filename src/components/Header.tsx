"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Apple, Dumbbell, Flame, House, Menu, Repeat2, UserRound, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

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
  const [isOpen, setIsOpen] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");

  useEffect(() => {
    async function loadProfiles() {
      const { data } = await createClient().from("meal_profiles").select("*").order("name");
      const loadedProfiles = (data || []) as Profile[];
      setProfiles(loadedProfiles);
      const rememberedProfileId = window.localStorage.getItem("selected-profile-id");
      const nextProfileId =
        loadedProfiles.find((profile) => profile.id === rememberedProfileId)?.id ||
        loadedProfiles[0]?.id ||
        "";
      setSelectedProfileId(nextProfileId);
    }

    loadProfiles();
  }, []);

  function changeProfile(profileId: string) {
    setSelectedProfileId(profileId);
    window.localStorage.setItem("selected-profile-id", profileId);
    window.dispatchEvent(new Event("selected-profile-changed"));
  }

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/35 backdrop-blur-xl">
      <div className="mx-auto max-w-6xl px-4 py-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 text-xl font-bold">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-lime-300 text-black shadow-[0_0_24px_rgba(124,255,79,0.45)]">
              <Dumbbell className="h-5 w-5" />
            </span>
            <span>PJ Meal Calculator</span>
          </Link>

          <button
            type="button"
            onClick={() => setIsOpen((current) => !current)}
            className="grid h-11 w-11 place-items-center rounded-2xl bg-white/5 text-white md:hidden"
            aria-label={isOpen ? "Close menu" : "Open menu"}
          >
            {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        <nav
          className={`${
            isOpen ? "mt-4 flex" : "hidden"
          } flex-col gap-2 md:flex md:flex-row md:items-center md:justify-end`}
        >
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
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

          {profiles.length > 0 && (
            <select
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white"
              value={selectedProfileId}
              onChange={(event) => changeProfile(event.target.value)}
            >
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          )}
        </nav>
      </div>
    </header>
  );
}
