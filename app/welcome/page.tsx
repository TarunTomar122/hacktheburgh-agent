import { redirect } from "next/navigation";
import { Suspense } from "react";
import { authEnabled, getAuth0 } from "../../lib/auth0";
import { Stripes } from "../case/Header";
import { Logo } from "../ui";

/** Where a signed-out visitor lands (D74): Sign up for a new account, Log in for an existing one. Both go through Auth0. */
export default function Welcome(props: PageProps<"/welcome">) {
  // The session and the address's query are runtime data, so they are read inside <Suspense> (Cache Components).
  return (
    <Suspense fallback={null}>
      <WelcomeContent {...props} />
    </Suspense>
  );
}

async function WelcomeContent(props: PageProps<"/welcome">) {
  if (!authEnabled() || (await getAuth0().getSession())) redirect("/case");

  // Only a path on this site is kept as the place to go back to after signing in.
  const asked = (await props.searchParams).returnTo;
  const returnTo = typeof asked === "string" && asked.startsWith("/") && !asked.startsWith("//") ? asked : "/case";
  const q = encodeURIComponent(returnTo);

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="shrink-0">
        <header className="flex h-16 items-center bg-brand px-6 text-white sm:px-8">
          <Logo />
        </header>
        <Stripes />
      </div>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-16">
        <div className="fade-up space-y-6">
          <h1 className="display text-[34px] sm:text-[44px]">
            Sign up to prepare your case. <span className="text-muted">Log in to carry on with it.</span>
          </h1>
          <p className="max-w-xl text-[17px] leading-7 text-ink-2">
            Your case is saved to your account, so you can pick it up on any device. The agent fills in forms for you and stops before Submit: you press it yourself.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <a href={`/auth/login?screen_hint=signup&returnTo=${q}`} className="btn-primary !px-7 !py-3 !text-[15px]">
              Sign up
            </a>
            <a href={`/auth/login?returnTo=${q}`} className="btn-ghost !px-7 !py-3 !text-[15px]">
              Log in
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
