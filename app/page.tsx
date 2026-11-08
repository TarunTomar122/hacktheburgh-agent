import Image from "next/image";
import Link from "next/link";
import { Stripes } from "./case/Header";
import AccountMenu from "./AccountMenu";
import StartLink, { NewCaseLink } from "./StartLink";
import { Logo } from "./ui";

// ui.tsx is a client module, so its cx() cannot be called from this server component.
const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

/**
 * Landing page. Same look as the rest of the app (docs/DESIGN.md): Wordsmith blue header with stripes, light serif headlines
 * with a tinted highlight, flat hairline cards, cream and charcoal panels. No shadows, no gradients.
 * The only action is "Start consultation" (or "Continue your case" when one is saved), see StartLink.
 */

const CREW = [
  { id: "elliot", name: "Elliot", role: "Leads your case", line: "Talks to you, keeps the plan, and tells you what happens next.", tint: "bg-brand-soft" },
  { id: "robin", name: "Robin", role: "Finds and checks solicitors", line: "Searches the official registers, then checks each firm before you hear its name.", tint: "bg-subtle" },
  { id: "nell", name: "Nell", role: "Funding", line: "Works out whether legal aid or a compensation scheme could pay.", tint: "bg-amber-soft" },
  { id: "iona", name: "Iona", role: "Clinical evidence", line: "Reads the clinical guidance, so your complaint says what should have happened.", tint: "bg-purple-soft" },
  { id: "kit", name: "Kit", role: "Enquiries", line: "Fills in the enquiry forms and stops before sending, so you press the button.", tint: "bg-subtle" },
] as const;

export default function Landing() {
  return (
    <div className="min-h-dvh bg-white">
      <SiteHeader />
      <main>
        <Hero />
        <Product />
        <HowItWorks />
        <Crew />
        <Proof />
        <Closing />
      </main>
      <SiteFooter />
    </div>
  );
}

/* ---------- header and footer ---------- */

function SiteHeader() {
  return (
    <div className="sticky top-0 z-30">
      <header className="flex h-16 items-center justify-between bg-brand px-6 text-white sm:px-8">
        <div className="flex items-center gap-8">
          <Link href="/" aria-label="Elliot, home" className="rounded-full outline-offset-4 focus-visible:outline-2 focus-visible:outline-white">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-white/85 md:flex" aria-label="Page sections">
            <a href="#how" className="transition-colors hover:text-white">How it works</a>
            <a href="#crew" className="transition-colors hover:text-white">The crew</a>
            <a href="#proof" className="transition-colors hover:text-white">Why trust it</a>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          {/* Signed in (Auth0): who you are and Log out. Nothing while accounts are off. */}
          <AccountMenu />
          <StartLink className="inline-flex items-center gap-2 rounded-ctl bg-white px-5 py-2 text-sm font-medium text-brand transition-colors hover:bg-brand-soft" />
        </div>
      </header>
      <Stripes />
    </div>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-line bg-white px-6 py-10 sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <Logo className="h-9" />
          <p className="max-w-[46ch] text-sm leading-6 text-muted">
            Elliot is not a law firm and does not give medical or legal advice. It finds the routes open to you, prepares the paperwork and stops before anything is sent.
          </p>
        </div>
        <div className="flex gap-8 text-sm text-ink-2">
          <a href="#how" className="hover:text-brand">How it works</a>
          <a href="#crew" className="hover:text-brand">The crew</a>
          <Link href="/insights" className="hover:text-brand">How the crew uses the web</Link>
          <StartLink className="hover:text-brand" arrow={false} />
        </div>
      </div>
    </footer>
  );
}

/* ---------- hero ---------- */

function Hero() {
  return (
    <section className="px-6 pb-8 pt-16 sm:px-8 sm:pt-24">
      <div className="mx-auto max-w-6xl">
        <h1 className="display fade-up max-w-[17ch] text-[44px] sm:text-[72px] lg:text-[88px]">
          After <span className="hl-blue">medical negligence</span>, find what to do next.
        </h1>
        <p className="fade-up mt-8 max-w-[56ch] text-lg leading-8 text-ink-2" style={{ animationDelay: "80ms" }}>
          Tell Elliot what happened, whether it was a missed diagnosis, a surgical error or the wrong medicine. A small crew of agents reads the official complaint, claims and legal aid sites for the place where it happened, and builds your route, step by step.
        </p>
        <div className="fade-up mt-10 flex flex-wrap items-center gap-4" style={{ animationDelay: "160ms" }}>
          <StartLink className="inline-flex items-center gap-2 rounded-ctl bg-brand px-7 py-3.5 text-[15px] font-medium text-white transition-colors hover:bg-brand/90" />
          <a href="#how" className="inline-flex items-center rounded-ctl border border-line bg-white px-7 py-3.5 text-[15px] font-medium text-ink transition-colors hover:border-faint">
            See how it works
          </a>
          <NewCaseLink className="inline-flex items-center rounded-ctl border border-line bg-white px-7 py-3.5 text-[15px] font-medium text-ink transition-colors hover:border-faint" />
        </div>
        <p className="fade-up mt-5 text-sm text-muted" style={{ animationDelay: "220ms" }}>
          Nothing is sent to anyone without you. Whether it counts as negligence is for a solicitor to say.
        </p>
      </div>
    </section>
  );
}

/* ---------- product picture ---------- */

type CrewKey = (typeof CREW)[number]["id"];
type RouteState = "done" | "working" | "waiting";

const ROUTE: { part: string; note: string; where: string; by: CrewKey; state: RouteState }[] = [
  { part: "The hospital's own complaint page", note: "Form found, 12 month limit noted", where: "hse.ie", by: "robin", state: "done" },
  { part: "The ombudsman", note: "Steps and limits noted", where: "ombudsman.ie", by: "robin", state: "done" },
  { part: "State claims scheme", note: "Reading how a claim starts", where: "stateclaims.ie", by: "nell", state: "working" },
  { part: "Free legal advice", note: "Checking the opening hours and rules", where: "flac.ie", by: "nell", state: "working" },
  { part: "Register of solicitors", note: "Next in line", where: "lawsociety.ie", by: "robin", state: "waiting" },
  { part: "Clinical guidance", note: "Next in line", where: "hse.ie", by: "iona", state: "waiting" },
];

const LOG: { by: CrewKey; text: string }[] = [
  { by: "elliot", text: "Read your story. Care in Dublin, 2025." },
  { by: "robin", text: "Opened the hospital complaints page." },
  { by: "robin", text: "Found the form: 4 fields, 1 file upload." },
  { by: "nell", text: "Checking the rules for legal aid in Ireland." },
  { by: "iona", text: "Reading the guidance on missed fractures." },
  { by: "elliot", text: "Route found. Waiting for you to review." },
];

const CHIP: Record<RouteState, { label: string; cls: string }> = {
  done: { label: "Found", cls: "bg-teal-soft text-teal" },
  working: { label: "Reading", cls: "bg-brand-soft text-brand" },
  waiting: { label: "Queued", cls: "bg-subtle text-faint" },
};

function Mark({ id, size = 28 }: { id: CrewKey; size?: number }) {
  return <Image src={`/crew/${id}-256.png`} alt="" width={size * 2} height={size * 2} unoptimized style={{ width: size, height: size }} className="shrink-0 object-contain" />;
}

function Product() {
  return (
    <section className="px-6 pb-20 pt-10 sm:px-8 sm:pb-28">
      <div className="mx-auto max-w-6xl rounded-card bg-brand-soft p-3 sm:p-6 lg:p-12">
        <div className="overflow-hidden rounded-card border border-brand/15 bg-white">
          {/* window bar */}
          <div className="flex items-center gap-4 border-b border-line bg-subtle px-4 py-3">
            <div className="flex gap-1.5" aria-hidden>
              <span className="h-2.5 w-2.5 rounded-full bg-fade" />
              <span className="h-2.5 w-2.5 rounded-full bg-fade" />
              <span className="h-2.5 w-2.5 rounded-full bg-fade" />
            </div>
            <div className="mx-auto w-full max-w-sm rounded-ctl border border-line bg-white px-3 py-1 text-center text-xs text-muted">elliot · your route</div>
            <div className="flex items-center gap-2 text-xs font-medium text-teal">
              <span className="soft-pulse h-2 w-2 rounded-full bg-teal" aria-hidden />
              Live
            </div>
          </div>

          <div className="grid lg:grid-cols-[1.05fr_1fr]">
            {/* route */}
            <div className="space-y-6 p-6 sm:p-9">
              <div className="space-y-3">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <div className="display text-[32px]">Your route</div>
                    <div className="mt-1 text-sm text-muted">Care in Dublin · missed fracture at A&amp;E</div>
                  </div>
                  <div className="text-right">
                    <div className="display text-[40px] text-brand">2<span className="text-[22px] text-faint"> of 6</span></div>
                  </div>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-line-soft" aria-hidden>
                  <div className="h-full w-1/3 rounded-full bg-brand" />
                </div>
              </div>
              <ul className="space-y-2.5">
                {ROUTE.map((r, i) => {
                  const chip = CHIP[r.state];
                  return (
                    <li
                      key={r.part}
                      className={cx(
                        "fade-up flex items-center gap-4 rounded-card border px-4 py-3.5",
                        r.state === "working" ? "border-brand/40 bg-white ring-4 ring-brand-soft" : r.state === "done" ? "border-line bg-white" : "border-line-soft bg-subtle",
                      )}
                      style={{ animationDelay: `${i * 90}ms` }}
                    >
                      <div className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-card", r.state === "waiting" ? "bg-white opacity-60" : "bg-subtle")}>
                        <Mark id={r.by} size={28} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className={cx("text-[15px] font-medium", r.state === "waiting" ? "text-muted" : "text-ink")}>{r.part}</div>
                        <div className="text-[13px] text-muted">
                          {r.note} <span className="text-faint">· {r.where}</span>
                        </div>
                      </div>
                      <span className={cx("inline-flex shrink-0 items-center gap-1.5 rounded-ctl px-2.5 py-1 text-xs font-medium", chip.cls)}>
                        {r.state === "done" && (
                          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M2.5 6.5l2.5 2.5 4.5-5.5" />
                          </svg>
                        )}
                        {r.state === "working" && <span className="soft-pulse h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />}
                        {chip.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* live agent view */}
            <div className="flex flex-col gap-5 bg-night p-6 sm:p-9">
              <div className="flex items-center justify-between text-xs text-night-meta">
                <span className="font-medium uppercase tracking-[0.1em]">Robin&apos;s browser</span>
                <span>3 agents · 11 pages read</span>
              </div>

              <div className="relative overflow-hidden rounded-card bg-white text-ink">
                <div className="flex items-center gap-2 border-b border-line bg-subtle px-3 py-2">
                  <div className="w-full rounded-ctl border border-line bg-white px-3 py-1 text-[11px] text-muted">hse.ie/en/complaints/make-a-complaint</div>
                </div>
                <div className="space-y-3.5 p-5">
                  <div className="display text-[22px]">Make a complaint</div>
                  <FormField label="Your name" value="Sinead" />
                  <FormField label="Date it happened" value="3 March 2025" />
                  <FormField label="What happened" value="A broken wrist was missed at A&E" focus />
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <span className="rounded-ctl bg-fade px-4 py-2 text-[13px] font-medium text-white">Send complaint</span>
                    <span className="text-xs text-muted">Left for you to press</span>
                  </div>
                </div>
                <div className="absolute bottom-[4.9rem] right-6 flex items-center gap-1.5 rounded-ctl bg-brand px-2.5 py-1 text-[11px] font-medium text-white">
                  <Mark id="robin" size={16} />
                  Robin
                </div>
              </div>

              <div className="space-y-2.5 text-[13px] leading-5">
                {LOG.map((l, i) => {
                  const last = i === LOG.length - 1;
                  return (
                    <div key={l.text} className="fade-up flex items-start gap-2.5" style={{ animationDelay: `${600 + i * 450}ms` }}>
                      <Mark id={l.by} size={20} />
                      <div className={last ? "text-white" : "text-night-meta"}>
                        <span className="mr-1.5 font-medium capitalize text-night-text">{l.by}</span>
                        {l.text}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FormField({ label, value, focus }: { label: string; value: string; focus?: boolean }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">{label}</div>
      <div className={cx("rounded-ctl border bg-white px-3 py-2 text-[14px]", focus ? "border-brand ring-4 ring-brand-soft" : "border-line")}>
        {value}
        {focus && <span className="soft-pulse ml-0.5 inline-block h-4 w-px translate-y-0.5 bg-brand" aria-hidden />}
      </div>
    </div>
  );
}

/* ---------- how it works ---------- */

function HowItWorks() {
  const steps = [
    { n: "1", title: "Tell your story", body: "Answer a few plain questions: what happened, where, and what you hope for. Elliot asks only what it needs." },
    { n: "2", title: "The crew finds your route", body: "Agents open the real official sites for your place, live. They find the complaint form, the ombudsman, the claims scheme, legal aid and solicitors." },
    { n: "3", title: "You review and press send", body: "Every form is filled in for you in a browser you can watch. It stops at the final button. You read it, and you decide." },
  ];
  return (
    <section id="how" className="scroll-mt-24 bg-paper px-6 py-20 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <h2 className="display max-w-[20ch] text-[36px] sm:text-[52px]">
          From <span className="hl-blue">what happened</span> to a route you can follow
        </h2>
        <div className="mt-14 grid gap-px overflow-hidden rounded-card border border-rail bg-rail md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="space-y-4 bg-white p-8">
              <div className="display text-[56px] text-brand">{s.n}</div>
              <div className="display text-[26px]">{s.title}</div>
              <p className="text-[15px] leading-7 text-ink-2">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- crew ---------- */

function Crew() {
  return (
    <section id="crew" className="scroll-mt-24 px-6 py-20 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <h2 className="display max-w-[22ch] text-[36px] sm:text-[52px]">
          Meet the <span className="hl-blue">crew</span> working on your case
        </h2>
        <p className="mt-6 max-w-[58ch] text-lg leading-8 text-ink-2">
          Each agent has one job and shows its work, so you can see who is doing what while it happens.
        </p>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {CREW.map((c) => (
            <div key={c.id} className="flex flex-col overflow-hidden rounded-card border border-line bg-white">
              <div className={cx("flex h-44 items-center justify-center", c.tint)}>
                <Image src={`/crew/${c.id}-256.png`} alt={c.name} width={256} height={256} unoptimized className="h-36 w-36 object-contain" />
              </div>
              <div className="flex flex-1 flex-col gap-1.5 p-5">
                <div className="display text-[24px]">{c.name}</div>
                <div className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted">{c.role}</div>
                <p className="mt-2 text-sm leading-6 text-ink-2">{c.line}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- proof ---------- */

function Proof() {
  const points = [
    { title: "Nothing is made up", body: "Each fact on your route is a quote from a real page. Code checks the quote against the page before it is shown." },
    { title: "Any place, no scripts", body: "There is no list of hospitals baked in. The crew discovers the sites for your country live, the way you would, only faster." },
    { title: "It never sends for you", body: "Forms are filled in front of you and left open. The last click is always yours." },
  ];
  return (
    <section id="proof" className="scroll-mt-24 bg-night px-6 py-20 text-night-text sm:px-8 sm:py-28">
      <div className="mx-auto grid max-w-6xl gap-14 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <div>
          <h2 className="display text-[36px] text-white sm:text-[52px]">
            Every claim has a <span className="rounded-[3px] bg-white/10 px-[0.18em] text-white">source</span> you can open
          </h2>
          <div className="mt-10 space-y-7">
            {points.map((p) => (
              <div key={p.title} className="border-l-2 border-brand pl-5">
                <div className="text-[17px] font-medium text-white">{p.title}</div>
                <p className="mt-1 text-[15px] leading-7 text-night-meta">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-card bg-white p-7 text-ink">
          <div className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted">Time limit to complain</div>
          <div className="display mt-2 text-[30px]">12 months from the event, or from when you found out</div>
          <blockquote className="mt-5 rounded-ctl bg-paper px-5 py-4 font-serif text-[17px] leading-7 text-ink">
            “A complaint should be made within 12 months of the date of the incident, or within 12 months of becoming aware of it.”
          </blockquote>
          <div className="mt-5 flex items-center justify-between gap-4 border-t border-line-soft pt-4 text-sm">
            <span className="text-muted">Illustration of a source, not advice</span>
            <span className="inline-flex items-center gap-1.5 font-medium text-teal">
              <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M2.5 6.5l2.5 2.5 4.5-5.5" />
              </svg>
              Quote matches page
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- closing ---------- */

function Closing() {
  return (
    <section className="bg-brand px-6 py-20 text-white sm:px-8 sm:py-28">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-10 md:flex-row md:items-end md:justify-between">
        <h2 className="display max-w-[18ch] text-[40px] text-white sm:text-[60px]">You do not have to work this out alone</h2>
        <div className="space-y-3">
          <StartLink className="inline-flex items-center gap-2 rounded-ctl bg-white px-8 py-4 text-base font-medium text-brand transition-colors hover:bg-brand-soft" />
          <p className="text-sm text-white/75">A few plain questions, then the crew gets to work.</p>
        </div>
      </div>
    </section>
  );
}
