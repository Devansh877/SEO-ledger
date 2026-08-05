"use client";
import { useState } from "react";
import { ChevronDown, ChevronUp, Info } from "lucide-react";

// Not app functionality — this is reference copy the agency can point a
// client to (or paste into an onboarding email) when they ask "why does my
// dashboard say #3 but I see #5 on my phone?" It's the single most common
// support question in rank tracking, so it earns a permanent spot here
// rather than living only in a Slack thread somewhere.
export default function RankingAccuracyNote() {
  const [open, setOpen] = useState(false);

  return (
    <div className="card">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between text-left"
      >
        <span className="flex items-center gap-2 font-semibold text-[13px]">
          <Info size={14} className="text-slate" />
          Why a client's own search might not match this dashboard
        </span>
        {open ? <ChevronUp size={14} className="text-slate" /> : <ChevronDown size={14} className="text-slate" />}
      </button>

      {open && (
        <div className="mt-3 text-[12.5px] text-slate leading-relaxed space-y-3">
          <p>
            This dashboard pulls a <span className="font-mono text-ink">clean SERP</span> —
            a search run from a server actually located in the target city,
            logged out, with no history attached. A client's own browser
            shows a <span className="font-mono text-ink">dirty SERP</span> —
            shaped by things a tracking tool can never see:
          </p>
          <ul className="list-disc pl-4 space-y-1.5">
            <li>
              <span className="text-ink font-medium">Search history & personalization</span> —
              if they frequently click their own site or a competitor's,
              Google quietly boosts that result for their account
              specifically.
            </li>
            <li>
              <span className="text-ink font-medium">Micro-location</span> —
              local results (especially the Map Pack) can shift block by
              block. Tracking the canonical center of a city won't always
              match someone searching from a specific suburb or office.
            </li>
            <li>
              <span className="text-ink font-medium">Device</span> — mobile
              and desktop results can have different layouts and even a
              different order. Each tracked keyword here is pinned to one
              device for exactly this reason.
            </li>
          </ul>
          <p className="pt-1 border-t border-line">
            <span className="text-ink font-medium">To hand to a client:</span>{" "}
            if they want to sanity-check a ranking themselves, ask them to
            search in an Incognito/Private window (strips personalization)
            and, ideally, use a location-spoofing extension (e.g. "GS
            Location Changer") set to the same city this dashboard tracks.
            That gets their manual check as close as possible to a clean
            SERP — it still won't be guaranteed identical, but it removes
            the two biggest sources of mismatch.
          </p>
        </div>
      )}
    </div>
  );
}
