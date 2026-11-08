import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import "./globals.css";
import { currentAccount } from "../lib/auth0";
import { AccountProvider } from "./AccountMenu";
import LiveView from "./LiveView";

export const metadata: Metadata = {
  title: "Elliot",
  description: "Work out what to do next after a medical mistake",
};

/** Reads who is signed in (cookies), so it sits inside <Suspense>: with Cache Components, runtime data outside one blocks the route. */
async function Accounts({ children }: { children: ReactNode }) {
  const account = await currentAccount();
  return (
    <AccountProvider account={account}>
      {children}
      {/* The live browser panel talks to /api/live, which needs an account: nothing to watch on the signed-out page. */}
      {(!account.enabled || account.sub) && <LiveView />}
    </AccountProvider>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <Suspense fallback={null}>
          <Accounts>{children}</Accounts>
        </Suspense>
      </body>
    </html>
  );
}
