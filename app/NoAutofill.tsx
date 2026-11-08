"use client";

import { useEffect } from "react";

/**
 * The browser's own saved names and addresses never pop up over Elliot's fields: every input, text area and select on the
 * page gets autocomplete="off", including ones that mount later.
 */
export default function NoAutofill() {
  useEffect(() => {
    const off = (root: ParentNode) => {
      for (const el of Array.from(root.querySelectorAll("input, textarea, select"))) {
        if (el.getAttribute("autocomplete") !== "off") el.setAttribute("autocomplete", "off");
      }
    };
    off(document);
    const mo = new MutationObserver((list) => {
      for (const m of list) for (const n of Array.from(m.addedNodes)) if (n instanceof Element) off(n.parentNode ?? n);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);
  return null;
}
