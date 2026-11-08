import { cx } from "../ui";

/**
 * A slim bar along the bottom edge of the run header: the run's estimated progress (see runProgress.ts).
 * It is a real progressbar for screen readers. The fill glides (and stands still for people who ask for reduced motion).
 */
export default function RunProgressBar({ pct }: { pct: number }) {
  return (
    <div role="progressbar" aria-label="Estimated progress of this run" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={pct >= 100 ? "Finished" : `About ${pct} percent`} className="absolute inset-x-0 -bottom-px h-[3px] bg-line-soft">
      <div className={cx("h-full rounded-r-full bg-brand transition-[width] duration-1000 ease-out motion-reduce:transition-none", pct >= 100 && "bg-teal")} style={{ width: `${pct}%` }} />
    </div>
  );
}
