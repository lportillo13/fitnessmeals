"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Apple, Dumbbell, Flame, House, Menu, Play, Soup, Square, UserRound, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

const navItems = [
  { label: "Home", href: "/", icon: House },
  { label: "Calculator", href: "/calculator", icon: Dumbbell },
  { label: "Foods", href: "/foods", icon: Apple },
  { label: "Meals", href: "/meals", icon: Soup },
  { label: "Fasting", href: "/fasting", icon: Flame },
  { label: "Profile", href: "/profile", icon: UserRound },
];

export default function Header() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [isFasting, setIsFasting] = useState(false);

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

  useEffect(() => {
    function syncFast() {
      const saved = window.localStorage.getItem("fasting-session");
      if (!saved) {
        setIsFasting(false);
        return;
      }
      const session = JSON.parse(saved) as { endedAt: string | null };
      setIsFasting(!session.endedAt);
    }

    syncFast();
    window.addEventListener("fasting-session-changed", syncFast);
    return () => window.removeEventListener("fasting-session-changed", syncFast);
  }, []);

  function changeProfile(profileId: string) {
    setSelectedProfileId(profileId);
    window.localStorage.setItem("selected-profile-id", profileId);
    window.dispatchEvent(new Event("selected-profile-changed"));
  }

  function toggleFast() {
    if (isFasting) {
      const saved = window.localStorage.getItem("fasting-session");
      if (!saved) return;
      const session = JSON.parse(saved) as { startedAt: string; targetHours: number; endedAt: string | null };
      window.localStorage.setItem(
        "fasting-session",
        JSON.stringify({ ...session, endedAt: new Date().toISOString() })
      );
    } else {
      window.localStorage.setItem(
        "fasting-session",
        JSON.stringify({ startedAt: new Date().toISOString(), targetHours: 14, endedAt: null })
      );
    }
    window.dispatchEvent(new Event("fasting-session-changed"));
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
          <button
            type="button"
            onClick={toggleFast}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${
              isFasting ? "bg-rose-300 text-black" : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
            }`}
          >
            {isFasting ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {isFasting ? "End fast" : "Start fast"}
          </button>
        </nav>
      </div>
    </header>
  );
}
