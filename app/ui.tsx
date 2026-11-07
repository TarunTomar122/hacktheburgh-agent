"use client";

/**
 * Shared UI pieces. Every screen should build from these and the tokens in globals.css, so the look stays one thing.
 * Rules and sources: docs/DESIGN.md.
 */
import Image from "next/image";
import Link from "next/link";
import { useProfile } from "../lib/profile";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

/* ---------- text ---------- */

/** Small letter-spaced uppercase label (Wordsmith's "MAIN CRITERION" style). */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("text-[11px] font-medium uppercase tracking-[0.1em] text-muted", className)}>{children}</div>;
}

/**
 * Page title block: light serif headline and optional lede. No small label above the headline (Tarun: "a headline over a
 * headline"); `eyebrow` is accepted for older callers but not rendered.
 */
export function PageTitle({ title, lede }: { eyebrow?: ReactNode; title: ReactNode; lede?: ReactNode }) {
  return (
    <header className="space-y-3">
      <h1 className="display text-[40px] text-ink">{title}</h1>
      {lede && <p className="max-w-[56ch] text-[15px] leading-6 text-ink-2">{lede}</p>}
    </header>
  );
}

/** Section heading inside a page. */
export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 border-b border-line pb-2">
      <h2 className="display text-[22px] text-ink">{children}</h2>
      {aside}
    </div>
  );
}

/* ---------- buttons ---------- */

type Variant = "primary" | "secondary" | "ghost";
const VARIANT: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand/90 disabled:bg-fade disabled:text-white",
  secondary: "border border-line bg-white text-ink hover:border-faint disabled:text-faint disabled:hover:border-line",
  ghost: "text-brand hover:bg-brand-soft disabled:text-faint disabled:hover:bg-transparent",
};

/** One button style per intent. Primary is Wordsmith blue, flat, 5px radius, medium weight. */
export function Button({ variant = "primary", size = "md", className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  return (
    <button
      {...rest}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-ctl font-medium transition-colors disabled:cursor-not-allowed",
        size === "md" ? "px-6 py-3 text-sm" : "px-3 py-1.5 text-xs",
        VARIANT[variant],
        className,
      )}
    />
  );
}

/* ---------- form controls ---------- */

export const control =
  "w-full rounded-ctl border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-faint outline-none transition-shadow hover:border-faint focus:border-brand focus:ring-4 focus:ring-brand-soft disabled:bg-subtle disabled:text-faint";

/** Dropdown: same as `control`, with a chevron (the `.select` rule in globals.css). */
export const selectControl = control + " select";

/** Label above a control, with optional hint underneath. */
export function Field({ label, hint, problem, children, className }: { label: ReactNode; hint?: ReactNode; problem?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block space-y-1.5", className)}>
      <span className="block text-[11px] font-medium uppercase tracking-[0.1em] text-muted">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
      {problem && <span className="block text-xs text-danger">{problem}</span>}
    </label>
  );
}

/* ---------- surfaces ---------- */

/** Warm "document" panel: used for text the user should read and may edit (the draft). */
export function Paper({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-card bg-paper px-8 py-7", className)}>{children}</div>;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-card border border-line bg-white p-6", className)}>{children}</div>;
}

/** A call to action: title and explanation on top, the button underneath (never side by side). */
export function ActionCard({ title, children, action }: { title: ReactNode; children: ReactNode; action: ReactNode }) {
  return (
    <Card className="space-y-5">
      <div className="space-y-1.5">
        <div className="display text-[22px] text-ink">{title}</div>
        <p className="max-w-[60ch] text-sm leading-6 text-ink-2">{children}</p>
      </div>
      <div>{action}</div>
    </Card>
  );
}

const TONE = {
  info: "bg-brand-soft text-ink border-brand/20",
  warn: "bg-amber-soft text-ink border-amber/30",
  ok: "bg-teal-soft text-ink border-teal/30",
  danger: "bg-danger-soft text-ink border-danger/30",
} as const;

/** A highlighted message. Tone sets the tint only; the text stays ink for contrast. */
export function Callout({ tone = "info", title, children, className }: { tone?: keyof typeof TONE; title?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div role="status" className={cx("rounded-card border px-5 py-4 text-sm", TONE[tone], className)}>
      {title && <div className="font-medium">{title}</div>}
      {children && <div className={cx("text-ink-2", !!title && "mt-1")}>{children}</div>}
    </div>
  );
}

/** Dark panel with mono text, for the live activity log. */
export function Console({ lines, label }: { lines: string[]; label: string }) {
  return (
    <div aria-label={label} className="max-h-56 overflow-y-auto rounded-card bg-night px-5 py-4 font-mono text-xs leading-5 text-night-text">
      {lines.map((l, i) => (
        <div key={i} className={i === lines.length - 1 ? "text-white" : "text-night-meta"}>
          {l}
        </div>
      ))}
    </div>
  );
}

/* ---------- brand + icons ---------- */

/**
 * The Elliot monogram (`public/logo.png`, 171x160, drawn at 40px tall so it stays sharp on 3x screens). A white disc with a navy ring and a blue
 * shadow stroke (the blue is the `brand` blue), so it stands out on the blue header and still reads on white. `unoptimized` serves the file
 * as it is (26 KB), with no image-optimiser request at the venue. Pass `className` to change the size, for example `h-12`.
 */
export function Logo({ className }: { className?: string }) {
  return <Image src="/logo.png" alt="Elliot" width={192} height={192} priority unoptimized className={cx("h-10 w-auto", className)} />;
}

/**
 * The logo as a link (D43). Before the interview is finished it goes to the landing page; once a case exists it goes to the profile.
 * On the case page, pass `onProfile` to open the profile in place instead of reloading the page.
 */
export function LogoLink({ onProfile }: { onProfile?: () => void }) {
  const profile = useProfile();
  const hasCase = Boolean(profile);
  const label = hasCase ? "Open your profile" : "Back to the start";
  return (
    <Link
      href={hasCase ? "/case#profile" : "/"}
      aria-label={label}
      title={label}
      onClick={(e) => {
        if (hasCase && onProfile) {
          e.preventDefault();
          onProfile();
        }
      }}
      className="rounded-full outline-offset-4 focus-visible:outline-2 focus-visible:outline-white"
    >
      <Logo />
    </Link>
  );
}

const icon = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const LockIcon = () => (
  <svg {...icon} aria-hidden>
    <rect x="3" y="7" width="10" height="7" rx="1.5" />
    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
  </svg>
);
export const UserIcon = () => (
  <svg {...icon} width={18} height={18} aria-hidden>
    <circle cx="8" cy="5.5" r="2.7" />
    <path d="M2.5 14c.6-2.7 2.6-4 5.5-4s4.9 1.3 5.5 4" />
  </svg>
);
export const ArrowLeftIcon = () => (
  <svg {...icon} aria-hidden>
    <path d="M13 8H3M7 4L3 8l4 4" />
  </svg>
);
