import { z } from "zod";
import type { Value } from "./browserAgent";

/** Answers the user gave on a step when the agent met a field it could not fill. Sent with the next run (D33). */
export const ExtraAnswers = z.array(z.object({ label: z.string().min(1), value: z.string().min(1) })).max(20);
export type ExtraAnswers = z.infer<typeof ExtraAnswers>;

export const extraValues = (extra: ExtraAnswers = []): Value[] =>
  extra.map((x, i) => {
    // A yes to the engine's tick-box question ('Do you agree to "X"? (yes or no)') must read as plain agreement, or the model is not
    // sure enough to tick the box (Yellow Card "Terms and conditions", 2026-11-08). Anything else stays the user's own answer.
    const box = x.label.match(/^Do you agree to "(.+)"\? \(yes or no\)$/);
    if (box && /^\s*(y|yes|yes please|i agree|agree|ok)\s*\.?\s*$/i.test(x.value)) {
      return { key: `user_answer_${i + 1}`, description: `The user explicitly agrees to "${box[1]}" and wants that box ticked`, value: "yes, I agree" };
    }
    return { key: `user_answer_${i + 1}`, description: `The user's answer to the form's question "${x.label}"`, value: x.value };
  });
