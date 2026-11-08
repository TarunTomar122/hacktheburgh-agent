"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { exitDemo, setProfileOwner, startSync, useDemo, useSyncStatus } from "../lib/profile";
import type { Account } from "../lib/auth0";

const AccountContext = createContext<Account>({ enabled: false, sub: null, name: null, email: null });

/** Who is signed in, for screens that can use it (the start page prefills the contact email from it). */
export const useAccount = () => useContext(AccountContext);

/**
 * Wraps the app (app/layout.tsx). Tells the profile store whose case this browser is showing, before anything below
 * reads it, so each account has its own saved case (D74), then fetches the case saved to the account (D75).
 */
export function AccountProvider({ account, children }: { account: Account; children: ReactNode }) {
  setProfileOwner(account.sub);
  useEffect(() => {
    if (account.sub) void startSync(account.sub);
  }, [account.sub]);
  return <AccountContext.Provider value={account}>{children}</AccountContext.Provider>;
}

const SAVE_LABEL = { saved: "Saved to your account", saving: "Saving...", error: "Not saved online yet" } as const;

/** The demo notice, who is signed in, and Log out, for the right of a header. Nothing when there is nothing to show. */
export default function AccountMenu() {
  const { enabled, sub, name } = useContext(AccountContext);
  const demo = useDemo();
  const save = useSyncStatus();
  const signedIn = enabled && sub;
  if (!signedIn && !demo) return null;
  return (
    <div className="flex shrink-0 items-center gap-3">
      {demo && (
        <div className="flex items-center gap-2 rounded-ctl border border-dashed border-white/50 px-3 py-1.5 text-xs text-white">
          <span>Demo: nothing here is saved</span>
          <button onClick={() => exitDemo()} className="font-medium underline underline-offset-2 hover:text-white/80">
            Exit demo
          </button>
        </div>
      )}
      {signedIn && (
        <>
          <div className="hidden max-w-[16rem] text-right leading-tight md:block">
            {name && <div className="break-words text-[13px] text-white/80">{name}</div>}
            {!demo && save !== "off" && <div className="text-[11px] text-white/60">{SAVE_LABEL[save]}</div>}
          </div>
          {/* A plain link, not a router link: logging out goes through the server (/auth/logout). */}
          <a
            href="/auth/logout"
            className="rounded-ctl border border-white/50 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:border-white hover:bg-white/10"
          >
            Log out
          </a>
        </>
      )}
    </div>
  );
}
