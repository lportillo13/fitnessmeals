"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Apple, ChevronDown, Dumbbell, Flame, House, Menu, Play, Soup, Square, TrendingDown, UserRound, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

const navItems = [
  { label: "Home", href: "/", icon: House },
  { label: "Calculator", href: "/calculator", icon: Dumbbell },
  { label: "Progress", href: "/progress", icon: TrendingDown },
];

const moreNavItems = [
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
  const [isMoreOpen, setIsMoreOpen] = useState(false);

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
      applyProfileTheme(loadedProfiles.find((profile) => profile.id === nextProfileId));
    }

    loadProfiles();
  }, []);

  useEffect(() => {
    function syncSelectedProfile() {
      const rememberedProfileId = window.localStorage.getItem("selected-profile-id");
      const nextProfile = profiles.find((profile) => profile.id === rememberedProfileId);
      if (!nextProfile) return;
      setSelectedProfileId(nextProfile.id);
      applyProfileTheme(nextProfile);
    }

    window.addEventListener("selected-profile-changed", syncSelectedProfile);
    return () => window.removeEventListener("selected-profile-changed", syncSelectedProfile);
  }, [profiles]);

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

  useEffect(() => {
    setIsMoreOpen(false);
  }, [pathname]);

  function changeProfile(profileId: string) {
    setSelectedProfileId(profileId);
    window.localStorage.setItem("selected-profile-id", profileId);
    applyProfileTheme(profiles.find((profile) => profile.id === profileId));
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
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/55 backdrop-blur-xl">
      <div className="mx-auto max-w-6xl px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="flex min-w-0 items-center gap-3 text-lg font-bold md:text-xl">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-lime-300 text-black shadow-[0_0_24px_rgba(124,255,79,0.45)]">
              <Dumbbell className="h-5 w-5" />
            </span>
            <span className="truncate">PJ Meal Calculator</span>
          </Link>

          <div className="hidden items-center gap-2 md:flex">
            <nav className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition ${
                      isActive
                        ? "bg-lime-300 text-black shadow-[0_0_20px_rgba(124,255,79,0.25)]"
                        : "text-slate-300 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className={item.label === "Calculator" ? "hidden lg:inline" : ""}>
                      {item.label}
                    </span>
                  </Link>
                );
              })}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsMoreOpen((current) => !current)}
                  className={`flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition ${
                    moreNavItems.some((item) => item.href === pathname)
                      ? "bg-lime-300 text-black shadow-[0_0_20px_rgba(124,255,79,0.25)]"
                      : "text-slate-300 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  More
                  <ChevronDown className="h-4 w-4" />
                </button>
                {isMoreOpen && (
                  <div className="surface absolute right-0 top-full z-50 mt-2 w-48 rounded-2xl p-2">
                    {moreNavItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = pathname === item.href;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setIsMoreOpen(false)}
                          className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition ${
                            isActive
                              ? "bg-lime-300 text-black"
                              : "text-slate-300 hover:bg-white/10 hover:text-white"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </nav>

            {profiles.length > 0 && (
              <select
                className="max-w-32 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white"
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
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
                isFasting
                  ? "bg-rose-300 text-black"
                  : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
              }`}
            >
              {isFasting ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              <span className="hidden lg:inline">{isFasting ? "End fast" : "Start fast"}</span>
            </button>
          </div>

          <div className="flex items-center gap-2 md:hidden">
            <button
              type="button"
              onClick={toggleFast}
              className={`grid h-11 w-11 place-items-center rounded-2xl ${
                isFasting ? "bg-rose-300 text-black" : "bg-white/5 text-white"
              }`}
              aria-label={isFasting ? "End fast" : "Start fast"}
            >
              {isFasting ? <Square className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </button>
            <button
              type="button"
              onClick={() => setIsOpen((current) => !current)}
              className="grid h-11 w-11 place-items-center rounded-2xl bg-white/5 text-white"
              aria-label={isOpen ? "Close menu" : "Open menu"}
            >
              {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {isOpen && (
          <div className="surface mt-3 rounded-3xl p-3 md:hidden">
            <nav className="grid grid-cols-2 gap-2">
              {[...navItems, ...moreNavItems].map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className={`flex items-center gap-2 rounded-2xl px-3 py-3 text-sm font-medium transition ${
                      isActive
                        ? "bg-lime-300 text-black"
                        : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-3 grid gap-2">
              {profiles.length > 0 && (
                <label className="grid gap-1 text-sm">
                  <span className="muted px-1">Profile</span>
                  <select
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white"
                    value={selectedProfileId}
                    onChange={(event) => changeProfile(event.target.value)}
                  >
                    {profiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

function applyProfileTheme(profile?: Profile) {
  document.documentElement.dataset.profileTheme =
    profile?.name.toLowerCase().includes("jaz") ? "jaz" : "leo";
}
