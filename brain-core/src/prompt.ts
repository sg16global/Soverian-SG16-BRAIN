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
    "Do not compare yourself with other products; stay neutral.",
    "Answer directly, without greeting or closing chatter.",
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
