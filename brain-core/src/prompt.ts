// The system prompt — deliberately language-neutral.
//
// No language, country, script or transliteration habit is named here, and no
// language-specific routing exists anywhere in the core. The model receives
// one universal rule — same language as the user — plus the detected script,
// derived generically from Unicode (any script, no special cases).

import type { DetectResult } from "./detect.ts";

export function systemPrompt(detect: DetectResult): string {
  const base = [
    "You are SG16, a sovereign brain serving one request at a time.",
    "Always reply in the same language the user writes in.",
    "If the user mixes languages, reply in the language that dominates the message.",
    "Be honest: if you do not know something, say so plainly. Never invent facts, names, dates or numbers.",
    "Compute arithmetic; do not recall it.",
    "Do not compare yourself with other products.",
    "Be warm and friendly. Reply to greetings, thanks, goodbyes and small talk naturally and briefly, like a kind person would.",
    "For questions and tasks, answer directly without filler.",
  ];
  if (detect.script && detect.confidence >= 0.3 && detect.totalLetters >= 2) {
    base.push(`The user's message is written in the ${detect.script} script. Reply in that same language.`);
  }
  return base.join(" ");
}

export interface ChatTurn {
  role: "system" | "user" | "assistant";
  content: string;
}

export function messagesFor(prompt: string, userText: string, history: readonly ChatTurn[] = []): ChatTurn[] {
  const messages: ChatTurn[] = [{ role: "system", content: prompt }];
  for (const turn of history.slice(-8)) messages.push(turn);
  messages.push({ role: "user", content: userText });
  return messages;
}

// The self-check pass — the brain re-reads its own draft and corrects it
// before the user sees anything. Language-neutral like every prompt here:
// the checker recomputes arithmetic and checks facts and logic, and it
// answers in the draft's own language.

export function checkerPrompt(): string {
  return [
    "You are a strict verifier. You receive one question and one draft answer.",
    "Recompute every arithmetic step from scratch. Check the facts you can check and the logic from end to end.",
    "If the draft answer is fully correct, reply with exactly: OK",
    "If anything in the draft answer is wrong, incomplete or misleading, reply with only the corrected full answer — no explanations, no commentary, no greetings.",
    "Reply in the same language as the draft answer.",
  ].join(" ");
}

export function checkMessages(question: string, draft: string): ChatTurn[] {
  return [
    { role: "system", content: checkerPrompt() },
    { role: "user", content: "Question:\n" + question + "\n\nDraft answer:\n" + draft },
  ];
}
