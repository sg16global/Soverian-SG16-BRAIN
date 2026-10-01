// ===================================================================
// CHILD SAFETY LAYER — pure functions, no framework imports, unit-tested.
//
// Used for the children's edition (sg16children.com, or any request that
// says audience:"child"). It can only make the ladder STRICTER:
//
//   1. crisis / abuse signals in the child's message -> a fixed, static,
//      gentle reply. The model never improvises there.
//   2. personal data in the child's message (phone, email, address, school,
//      full name) -> a fixed reply asking them not to share it; the text is
//      never forwarded to a model.
//   3. the model's OUTPUT is checked (the core gate plus the local filters
//      below) before a child sees it. Anything that fails, or cannot be
//      checked, is replaced by CHILD_FALLBACK. Answers are length-capped.
//
// HONEST LIMITS — read before trusting this:
//   * The pattern lists are small, English-first (plus a few Spanish/French
//     phrases) and easy to evade with misspellings, slang, other languages or
//     indirect wording. They catch common, plain-language cases only.
//   * The core gate is a risk scorer, not a guarantee; a harmful answer can
//     score low. A model can also produce something unsuitable that matches
//     none of these rules.
//   * This is a safety net, not a substitute for a parent or teacher being
//     nearby, and not a crisis service. It does not replace human review.
// ===================================================================

import type { ChildHooks } from "./answer-ladder.ts";

export const CHILD_MAX_ANSWER_CHARS = 600;
/** token budget handed to the model; the char cap above is the hard limit */
export const CHILD_MAX_NEW_TOKENS = 200;

export const CRISIS_REPLY =
  "I'm really glad you told me. What you feel matters, and you are not alone. " +
  "Please tell a grown-up you trust right now - a parent, a teacher or someone in your family. " +
  "If you are hurt or in danger right now, call your local emergency number " +
  "(like 112, 999 or 911) or ask someone near you to help. " +
  "I'm a computer friend, so a real person who cares about you can help in ways I can't.";

export const PERSONAL_DATA_REPLY =
  "Let's keep your private things private! Please don't tell me your name, address, school, " +
  "phone number or send photos - not to me and not to anyone online. " +
  "I'd love to talk about something else. What would you like to learn about?";

export const CHILD_REFUSAL =
  "I can't help with that one. Let's try something else! " +
  "If something is worrying you, a grown-up you trust can help.";

export const CHILD_FALLBACK =
  "Hmm, I'm not sure I can answer that one well. Can you ask me in a different way? " +
  "A grown-up you trust can also help you find out.";

// ---- crisis / abuse (child's message) -----------------------------------
const CRISIS_PATTERNS: RegExp[] = [
  // self-harm / suicide
  /\b(kill|killing|hurt|hurting|harm|harming|cut|cutting|hang|drown|poison)\s+(my\s*self|myself)\b/i,
  /\b(want|wanna|going|plan(ning)?|trying)\s+(to\s+)?(die|end\s+(it|my\s+life)|disappear\s+forever)\b/i,
  /\b(wish|wished)\s+(i\s+(was|were)|that\s+i\s+(was|were))\s+(dead|never\s+born)\b/i,
  /\b(suicid(e|al)|self[-\s]?harm|end\s+my\s+life|take\s+my\s+own\s+life)\b/i,
  /\b(don'?t|do\s+not|no\s+longer)\s+want\s+to\s+(live|be\s+alive|be\s+here)\b/i,
  /\b(no\s+reason\s+to\s+live|better\s+off\s+(dead|without\s+me)|nobody\s+(would\s+)?(miss|care\s+about)\s+me)\b/i,
  // abuse / unsafe at home
  /\b(someone|somebody|he|she|they|(my\s+)?(dad|mom|mum|father|mother|stepdad|stepmom|uncle|aunt|cousin|brother|sister|teacher|coach|babysitter|neighbou?r|friend'?s\s+(dad|mom|brother)))\s+(is\s+|keeps\s+|always\s+)?(hits?|hit|beats?|beat|hurts?|hurt|kicks?|touch(es|ed)?|molest(s|ed)?|abus(es|ed)|chok(es|ed)|hurting|hitting|beating|touching)\s+me\b/i,
  /\b(touch(ed|es|ing)?\s+me\s+(in|on)\s+(a\s+)?(private|bad|weird|wrong)|touch(ed|es)?\s+my\s+(private|body))/i,
  /\b(made|makes|making|wants?)\s+me\s+(touch|show|undress|take\s+off|send\s+(a\s+)?(photo|pic|picture|nude))\b/i,
  /\b(being|got|get)\s+(abused|molested|hit\s+at\s+home|beaten)\b/i,
  /\b(scared|afraid|terrified)\s+(to\s+go|of\s+going)\s+(home|back\s+home)\b/i,
  /\b(don'?t|do\s+not)\s+feel\s+safe\s+(at\s+home|with\s+(him|her|them))\b/i,
  /\b(keep|keeps|kept)\s+(it|this|a)\s+(a\s+)?secret\b.*\b(touch|hurt|hit|photo|naked|private)/i,
  // a few common phrases in other languages (minimal, NOT comprehensive)
  /\b(quiero\s+morir(me)?|me\s+quiero\s+matar|quiero\s+hacerme\s+da[nñ]o|me\s+(pega|golpea|toca)\s+(mi|el|la))\b/i,
  /\b(je\s+veux\s+mourir|je\s+veux\s+me\s+suicider|il\s+me\s+(frappe|touche)|elle\s+me\s+(frappe|touche))\b/i,
];

export function isCrisisMessage(text: string): boolean {
  return CRISIS_PATTERNS.some((re) => re.test(text));
}

// ---- personal data (child's message) ------------------------------------
const PERSONAL_DATA_PATTERNS: RegExp[] = [
  /\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/, // email
  /(?:\+?\d[\s().-]?){9,}/, // phone-length digit run
  /\bmy\s+(full\s+|last\s+|real\s+)?name\s+is\b/i,
  /\bmy\s+(home\s+)?address\b/i,
  /\bi\s+live\s+(at|on|in\s+the\s+house|near)\b/i,
  /\bmy\s+(phone|mobile|cell)(\s+number)?\b/i,
  /\bmy\s+school\s+is\b|\bi\s+go\s+to\s+[\w' -]{2,40}\s+(school|academy|college)\b/i,
  /\b(here'?s|this\s+is)\s+(a\s+)?(photo|pic|picture|selfie)\s+of\s+me\b/i,
  /\bmy\s+password\b/i,
];

export function containsPersonalData(text: string): boolean {
  return PERSONAL_DATA_PATTERNS.some((re) => re.test(text));
}

// ---- model output filters ------------------------------------------------
const OUTPUT_BLOCK_PATTERNS: RegExp[] = [
  // links, in any common shape
  /\bhttps?:\/\//i,
  /\bwww\.[a-z0-9-]/i,
  /\b[a-z0-9-]+\.(com|net|org|io|co|me|app|xyz|ru|cn|info|tv|gg|ly|link|site|online)\b/i,
  // contact details
  /\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/,
  /(?:\+?\d[\s().-]?){9,}/,
  // asking a child for personal data or a photo
  /\b(what('?s|\s+is)\s+your\s+(full\s+|last\s+|real\s+)?(name|address|phone|number|school|age|password)|where\s+do\s+you\s+(live|go\s+to\s+school)|which\s+school|tell\s+me\s+your\s+(name|address|school|phone|age)|share\s+your\s+(address|phone|photo|password|location)|send\s+(me\s+)?(a\s+)?(photo|pic|picture|selfie))\b/i,
  // suggesting a meeting or secrecy
  /\b(let'?s\s+meet|meet\s+(me|up)|come\s+(to\s+)?(my|over)|i('ll|\s+will)\s+(pick|come\s+get)\s+you|don'?t\s+tell\s+(your\s+)?(mom|dad|parents?|anyone|a\s+grown)|our\s+(little\s+)?secret|keep\s+(this|it)\s+(a\s+)?secret)\b/i,
  // adult / violent / sexual vocabulary (obvious words only)
  /\b(sex(ual|y)?|porn\w*|naked|nude|erotic|fetish|rape|gore|murder|kill(ing)?\s+(him|her|them|people)|suicide\s+method|how\s+to\s+(make|build)\s+a\s+(bomb|weapon)|drugs?\s+(dealer|recipe)|cocaine|heroin|meth)\b/i,
];

export function violatesChildOutputRules(text: string): boolean {
  return OUTPUT_BLOCK_PATTERNS.some((re) => re.test(text));
}

/** Trim to the child length cap at a sentence boundary where possible. */
export function capChildAnswer(text: string, max = CHILD_MAX_ANSWER_CHARS): string {
  const clean = text.replace(/\s+\n/g, "\n").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return (stop > max * 0.4 ? cut.slice(0, stop + 1) : cut.replace(/\s+\S*$/, "") + "...").trim();
}

export type ChildOutputSource = "ollama" | "core" | "local";

/**
 * Decide what a child may see. Returns the (length-capped) text, or null when
 * it must be replaced by CHILD_FALLBACK.
 *
 *  - model text ("ollama") also goes through the core gate; if the gate
 *    cannot be reached the text is NOT shown (fail closed for children);
 *  - deterministic core / local text is already core-gated, so only the local
 *    filters run on it.
 */
export async function checkChildOutput(
  text: string,
  source: ChildOutputSource,
  gate: (text: string) => Promise<{ allowed: boolean }>,
): Promise<string | null> {
  const capped = capChildAnswer(text);
  if (!capped || violatesChildOutputRules(capped)) return null;
  if (source === "ollama") {
    try {
      const verdict = await gate(capped);
      if (!verdict.allowed) return null;
    } catch {
      return null;
    }
  }
  return capped;
}

/** The hooks the ladder uses for a child. One definition, shared by the route and the tests. */
export function childHooks(gate: (text: string) => Promise<{ allowed: boolean }>): ChildHooks {
  return {
    preCheck: (text) =>
      isCrisisMessage(text)
        ? { content: CRISIS_REPLY, engine: "child-crisis" }
        : containsPersonalData(text)
          ? { content: PERSONAL_DATA_REPLY, engine: "child-fallback" }
          : null,
    refusal: CHILD_REFUSAL,
    checkOutput: (text, source) => checkChildOutput(text, source, gate),
    fallback: CHILD_FALLBACK,
  };
}
