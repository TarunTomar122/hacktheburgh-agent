"use client";

import AccountMenu from "../AccountMenu";
import { cx, LogoLink, UserIcon } from "../ui";

/** Wordsmith-blue top bar: logo and case name on the left, profile on the right. Followed by the stepped stripe (one thick line, then thinner ones). */
export default function Header({ name, profileOpen, incomplete, stripes = true, onProfile, onLogo }: { name: string; profileOpen: boolean; incomplete: boolean; stripes?: boolean; onProfile: () => void; onLogo: (to: "home" | "profile") => void }) {
  return (
    <div className="shrink-0">
      <header className="flex h-16 items-center justify-between bg-brand px-8 text-white">
        <div className="flex items-center gap-6">
          <LogoLink onGo={onLogo} />
          <span className="h-7 w-px bg-white/30" aria-hidden />
          <div className="leading-tight">
            <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-white/70">Case for</div>
            <div className="text-sm font-medium">{name}</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <AccountMenu />
          <button
            onClick={onProfile}
            aria-label={profileOpen ? "Close profile" : "Open profile"}
            title="Profile"
            className={cx(
              "relative flex h-10 w-10 items-center justify-center rounded-full border transition-colors",
              profileOpen ? "border-white bg-white text-brand" : "border-white/50 text-white hover:border-white hover:bg-white/10",
            )}
          >
            <UserIcon />
            {incomplete && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-brand bg-amber" title="Some details are missing" />}
          </button>
        </div>
      </header>
      {stripes && <Stripes />}
    </div>
  );
}

/**
 * Where the blue ends. D86 (Om, 2026-11-08): a clean edge, blue straight onto white. It used to be one thick line, then thinner and
 * fainter ones (D31). Kept as a component so every page changes in one place; it draws nothing now.
 */
export function Stripes() {
  return null;
}
