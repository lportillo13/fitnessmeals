"use client";

import { Frown, Smile, X } from "lucide-react";

export type MotivationTone = "positive" | "corrective";

export default function MotivationModal({
  message,
  tone,
  onClose,
}: {
  message: string;
  tone: MotivationTone;
  onClose: () => void;
}) {
  const Icon = tone === "positive" ? Smile : Frown;
  return (
    <div className="modal-overlay fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <div className="modal-panel surface w-full max-w-md rounded-3xl p-6 text-center">
        <button onClick={onClose} className="absolute right-4 top-4 rounded-xl bg-white/6 p-2">
          <X className="h-4 w-4" />
        </button>
        <span
          className={`mx-auto grid h-16 w-16 place-items-center rounded-full ${
            tone === "positive" ? "bg-lime-300 text-black" : "bg-rose-300 text-black"
          }`}
        >
          <Icon className="h-8 w-8" />
        </span>
        <p className="mt-4 text-lg font-semibold">{message}</p>
      </div>
    </div>
  );
}
