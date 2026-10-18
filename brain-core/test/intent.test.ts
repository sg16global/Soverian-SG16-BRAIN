import { test } from "node:test";
import assert from "node:assert/strict";

import { isCodeRequest } from "../src/intent.ts";
import { checkerPrompt, checkMessages } from "../src/prompt.ts";

test("code intent: fences, file extensions, stack traces, explicit asks", () => {
  assert.equal(isCodeRequest("fix this:\n```js\nconst x = 1\n```"), true);
  assert.equal(isCodeRequest("my app crashes, see src/app.ts line 4"), true);
  assert.equal(isCodeRequest("Traceback (most recent call last):\n  File \"x.py\", line 1\nNameError: name 'y' is not defined"), true);
  assert.equal(isCodeRequest("write a function that sorts a list"), true);
  assert.equal(isCodeRequest("debug this error: TypeError: undefined is not a function"), true);
  assert.equal(isCodeRequest("const add = (a, b) => { return a + b; }"), true);
});

test("chat intent stays on the chat brain", () => {
  assert.equal(isCodeRequest("how are you today"), false);
  assert.equal(isCodeRequest("what is the capital of France?"), false);
  assert.equal(isCodeRequest("explain quantum computing in simple words"), false);
  assert.equal(isCodeRequest("write a poem about the sea"), false);
  assert.equal(isCodeRequest(""), false);
});

test("the checker prompt is language-neutral and the messages carry question + draft", () => {
  const prompt = checkerPrompt();
  assert.ok(prompt.includes("OK"));
  const msgs = checkMessages("what is 2+2?", "2+2=5");
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].role, "system");
  assert.equal(msgs[1].role, "user");
  assert.ok(msgs[1].content.includes("what is 2+2?"));
  assert.ok(msgs[1].content.includes("2+2=5"));
});
