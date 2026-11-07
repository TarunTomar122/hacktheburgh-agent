import { z } from "zod";
import type { Value } from "./browserAgent";

/** Answers the user gave on a step when the agent met a field it could not fill. Sent with the next run (D33). */
export const ExtraAnswers = z.array(z.object({ label: z.string().min(1), value: z.string().min(1) })).max(20);
export type ExtraAnswers = z.infer<typeof ExtraAnswers>;

export const extraValues = (extra: ExtraAnswers = []): Value[] =>
  extra.map((x, i) => ({ key: `user_answer_${i + 1}`, description: `The user's answer to the form's question "${x.label}"`, value: x.value }));
