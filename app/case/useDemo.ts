"use client";

import { useEffect, useState } from "react";
import type { Profile } from "../../lib/profile";

/** Where this case is, for picking a recorded run made for the same place (demo/<run>/meta.json). */
export const placeOf = (p: Profile) => {
  const f = p.facts as Profile["facts"] & { region?: string | null; country?: string | null };
  return f.region || f.country || "Scotland";
};

/** Is there a recorded run of this flow for this place? (Demo controls only show when there is.) */
export function useDemoAvailable(flow: "step3" | "complaint" | "discovery" | "escalation" | "medicine", place: string) {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    void fetch(`/api/agent/plan/demo?flow=${flow}&place=${encodeURIComponent(place)}`).then((r) => setOk(r.ok)).catch(() => setOk(false));
  }, [flow, place]);
  return ok;
}
