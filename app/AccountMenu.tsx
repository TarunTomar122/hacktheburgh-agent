"use client";

import { createContext, useContext, type ReactNode } from "react";
import { setProfileOwner } from "../lib/profile";
import type { Account } from "../lib/auth0";

const AccountContext = createContext<Account>({ enabled: false, sub: null, name: null });

/**
 * Wraps the app (app/layout.tsx). Tells the profile store whose case this browser is showing, before anything below
 * reads it, so each account has its own saved case (D74).
 */
export function AccountProvider({ account, children }: { account: Account; children: ReactNode }) {
  setProfileOwner(account.sub);
  return <AccountContext.Provider value={account}>{children}</AccountContext.Provider>;
}

/** Who is signed in, and Log out, for the right of a header. Nothing when the app runs without accounts. */
export default function AccountMenu() {
  const { enabled, sub, name } = useContext(AccountContext);
  if (!enabled || !sub) return null;
  return (
    <div className="flex shrink-0 items-center gap-3">
      {name && <span className="hidden max-w-[16rem] break-words text-[13px] leading-tight text-white/80 md:inline">{name}</span>}
      {/* A plain link, not a router link: logging out goes through the server (/auth/logout). */}
      <a
        href="/auth/logout"
        className="rounded-ctl border border-white/50 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:border-white hover:bg-white/10"
      >
        Log out
      </a>
    </div>
  );
}
