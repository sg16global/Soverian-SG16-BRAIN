// Honest handling of languages the model writes badly.
//
// The base model (Mistral 7B) writes French, Spanish, German and many others well, Hindi passably,
// but Bengali (Bangla) as broken, meaningless text - tested on the live model. Showing nonsense to
// someone who trusted the answer is worse than saying so, so for Bengali we say it ourselves, in
// Bengali, with a fixed sentence, and answer in simple English.
// More languages can be added here once they are tested the same way.

const BENGALI = /[ঀ-৿]/g;
const LETTER = /\p{L}/gu;

export type WeakLanguage = "bengali";

export function weakLanguage(text: string): WeakLanguage | null {
  const letters = text.match(LETTER)?.length ?? 0;
  const bengali = text.match(BENGALI)?.length ?? 0;
  return bengali >= 3 && bengali / Math.max(letters, 1) >= 0.3 ? "bengali" : null;
}

/** Fixed, written by us (not the model): "I cannot yet write Bengali well, so I am answering in simple English." */
export const WEAK_LANGUAGE_NOTE: Record<WeakLanguage, string> = {
  bengali: "আমি এখনো বাংলায় ভালোভাবে লিখতে পারি না, তাই সহজ ইংরেজিতে উত্তর দিচ্ছি।",
};

/** Appended to the person's message so the model answers in plain English they can run through a translator. */
export const ENGLISH_FALLBACK_HINT = "\n\n(Please reply in short, simple English sentences.)";
