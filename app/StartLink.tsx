"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { clearProfile, useProfile } from "../lib/profile";

/** "Start consultation" for someone with no case yet; "Continue your case" for someone who has one saved on this device. */
export default function StartLink({ className, children = "Start consultation", arrow = true }: { className: string; children?: ReactNode; arrow?: boolean }) {
  const has = !!useProfile();
  return (
    <Link href={has ? "/case" : "/start"} className={className}>
      {has ? "Continue your case" : children}
      {arrow && (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 8h10M9 4l4 4-4 4" />
        </svg>
      )}
    </Link>
  );
}

/** Only for someone with a saved case: begin again with a new one (the saved case is replaced straight away, no popup). */
export function NewCaseLink({ className }: { className: string }) {
  const has = !!useProfile();
  const router = useRouter();
  if (!has) return null;
  return (
    <button
      className={className}
      onClick={() => {
        clearProfile();
        router.push("/start");
      }}
    >
      Start a new case
    </button>
  );
}
