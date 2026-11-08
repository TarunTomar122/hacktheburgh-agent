/** Dev-only: which discovery speed the next research run uses ("classic", "quick", "fast", or lever names), and how long the last one took. */
export const SPEED_KEY = "elliot-discovery-speed";
export const SPEED_CHOICES = [
  { id: "classic", label: "Classic" },
  { id: "quick", label: "Quick" },
  { id: "fast", label: "Fast" },
] as const;

export function readSpeedPref(): string | undefined {
  try {
    return localStorage.getItem(SPEED_KEY) || undefined;
  } catch {
    return undefined;
  }
}
export function writeSpeedPref(v: string) {
  try {
    localStorage.setItem(SPEED_KEY, v);
  } catch {
    /* private mode: the default (classic) is used */
  }
}
const timeKey = (caseId: string) => `elliot-discovery-time:${caseId}`;
export function writeResearchTime(caseId: string, ms: number, speed: string) {
  try {
    localStorage.setItem(timeKey(caseId), JSON.stringify({ ms, speed }));
  } catch {
    /* ignore */
  }
}
export function readResearchTime(caseId: string): { ms: number; speed: string } | null {
  try {
    return JSON.parse(localStorage.getItem(timeKey(caseId)) ?? "null");
  } catch {
    return null;
  }
}
export const minutes = (ms: number) => (ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${Math.floor(ms / 60_000)} min ${String(Math.round((ms % 60_000) / 1000)).padStart(2, "0")} s`);
