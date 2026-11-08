import type { Page } from "playwright";

/**
 * Tell a real enquiry form from a newsletter or mailing-list sign-up. A sign-up box (name and email, "Sign me up") is not
 * where a patient's enquiry goes, so it never counts as "the form" and its boxes are disabled before anything is typed.
 */

export const SIGNUP = /newsletter|subscri|sign me up|sign[ -]?up|mailing list|e-?news|keep (me )?(up to date|informed)|latest news/i;

/** The same test on raw HTML (a page read without a browser): is there a form a person could write an enquiry in? */
export function usableFormHtml(html: string): boolean {
  for (const m of html.matchAll(/<form\b[\s\S]*?<\/form>/gi)) {
    const f = m[0];
    const fields = (f.match(/<(input|select|textarea)\b[^>]*>/gi) ?? []).filter((t) => !/type=["']?(hidden|submit|button|checkbox|radio|image)\b|g-recaptcha/i.test(t));
    const textarea = fields.some((t) => /^<textarea/i.test(t));
    const email = fields.some((t) => /type=["']?email/i.test(t));
    if (textarea || (email && fields.length >= 4) || (email && fields.length === 3 && !SIGNUP.test(f))) return true;
  }
  return false;
}

/**
 * In the browser: disable the boxes of every sign-up form on the page (so no agent types into them) and count the forms
 * left that a person could write an enquiry in (a visible text area, or an email box in a form that is not a sign-up).
 */
export async function usableForms(page: Page): Promise<number> {
  return page
    .evaluate((signup) => {
      const re = new RegExp(signup, "i");
      let usable = 0;
      for (const form of Array.from(document.querySelectorAll("form"))) {
        const boxes = Array.from(form.querySelectorAll("input, select, textarea")).filter((el) => {
          const t = ((el as HTMLInputElement).type || "").toLowerCase();
          const r = (el as HTMLElement).getBoundingClientRect();
          return r.width > 0 && r.height > 0 && !["hidden", "submit", "button", "checkbox", "radio", "image"].includes(t);
        });
        if (!boxes.length) continue;
        const textarea = boxes.some((el) => el.tagName === "TEXTAREA");
        const email = boxes.some((el) => (el as HTMLInputElement).type === "email" || /e-?mail/i.test((el as HTMLInputElement).name || ""));
        const words = `${form.textContent ?? ""} ${form.id} ${form.className} ${form.getAttribute("action") ?? ""} ${Array.from(form.querySelectorAll("input[type=submit], button")).map((b) => (b as HTMLInputElement).value || b.textContent || "").join(" ")}`;
        const signupForm = !textarea && (boxes.length <= 2 || (boxes.length <= 3 && re.test(words)));
        if (signupForm) {
          form.setAttribute("data-signup", "1");
          for (const el of Array.from(form.querySelectorAll("input, select, textarea, button"))) (el as HTMLInputElement).disabled = true;
          continue;
        }
        if (textarea || email) usable++;
      }
      // A text area outside any form (some sites build their form without a form tag).
      for (const t of Array.from(document.querySelectorAll("textarea"))) {
        const r = t.getBoundingClientRect();
        if (!t.closest("form") && r.width > 0 && r.height > 0) usable++;
      }
      return usable;
    }, SIGNUP.source)
    .catch(() => 0);
}
