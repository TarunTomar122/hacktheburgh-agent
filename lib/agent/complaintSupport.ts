/** Client-safe. The model sometimes answers "none mentioned" in a sentence instead of leaving the field empty. */
export const hasSupport = (t: string) => !!t.trim() && !/^(no|none|nothing)\b|not mentioned|does not mention|doesn't mention/i.test(t.trim());
