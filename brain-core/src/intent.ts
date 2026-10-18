// Code-intent detection — decides which self-hosted model answers.
//
// This is NOT human-language detection (that lives in detect.ts and never
// routes). It recognizes programming intent from structural signals only:
// fenced code, stack traces, source-file extensions, explicit
// "fix/debug/write this code" requests, and code keywords next to code
// punctuation. It is deliberately conservative: a false positive still gets
// a capable small instruct model, and a false negative keeps the question on
// the chat brain. No human language is named or special-cased here.

const FENCE = /```/;
const STACK_TRACE = /Traceback \(most recent call last\)|\bat\s+[\w$.]+\s*\([^)]*:\d+(?::\d+)?\)|[A-Za-z]*(?:Error|Exception)\b/;
const FILE_EXT = /\b[\w-]+\.(?:py|js|ts|jsx|tsx|mjs|cjs|go|rs|java|c|cc|cpp|cxx|h|hpp|cs|rb|php|swift|kt|kts|scala|sh|bash|sql|html|css)\b/i;
const ASK_PAIR = /\b(?:write|fix|debug|refactor|implement|review|explain|translate|convert|correct)\b[^.\n]{0,80}\b(?:code|function|bug|error|script|program|snippet|query|regex|algorithm)\b/i;
const ASK_PAIR_REV = /\b(?:code|function|bug|script|program|snippet|query)\b[^.\n]{0,60}\b(?:fix|debug|refactor|repair|broken|not working|won't run|fails|error)\b/i;
const CODE_KEYWORD = /\b(?:function|class|def|return|import|export|const|let|var|await|async|lambda|console|public|private|protected|static|void|struct|enum|interface|impl|fn|func|printf|println|include|require|elif|self)\b/;
const CODE_PUNCT = /[{;}]|=>|\)\s*\{|\$\{/;

export function isCodeRequest(text: string): boolean {
  if (!text) return false;
  if (FENCE.test(text)) return true;
  if (STACK_TRACE.test(text)) return true;
  if (FILE_EXT.test(text)) return true;
  if (ASK_PAIR.test(text)) return true;
  if (ASK_PAIR_REV.test(text)) return true;
  return CODE_KEYWORD.test(text) && CODE_PUNCT.test(text);
}
