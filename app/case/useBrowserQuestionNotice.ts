import { useEffect } from "react";

export function useBrowserQuestionNotice(pending: boolean) {
  useEffect(() => {
    if (!pending) return;
    window.dispatchEvent(new CustomEvent("live-question", { detail: true }));
    return () => {
      window.dispatchEvent(new CustomEvent("live-question", { detail: false }));
    };
  }, [pending]);
}
