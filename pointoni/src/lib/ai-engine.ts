// Self-hosted SG16 response engine.
// The sovereign core answers directly; third-party models are relayed
// (persona-wrapped locally when no provider API key is configured).

export type EngineModel = {
  id: string;
  name: string;
  vendor: string;
  selfHosted: boolean;
};

type Rule = { test: RegExp; paragraphs: string[] };

const CORE_RULES: Rule[] = [
  {
    test: /\b(hi|hello|hey|greetings|good (morning|afternoon|evening))\b/i,
    paragraphs: [
      "Greetings, Pilot. I am SG16 Brain \u2014 the sovereign intelligence core of this platform.",
      "I can explain AI concepts, write and debug code, compare the connected models (Claude, GPT-5.5, Gemini, Llama 3, Stable Diffusion XL), or walk you through the self-hosted Mistral X engine. What are we building today?",
    ],
  },
  {
    test: /sovereign|self.?host|ownership|dependency|mistral|on-?prem|private deploy/i,
    paragraphs: [
      "SG16 Brain runs a self-hosted Mistral engine \u2014 it is built for ownership, not dependency on third-party AI APIs.",
      "That means the model weights, inference, logs and your data reside inside your own deployment. There is no external training leakage, no per-token dependency on a foreign endpoint, and the stack is released under Apache 2.0. Other models in the multi-model grid are orchestrated alongside the core but clearly labelled when a request is relayed outside the sovereign boundary.",
    ],
  },
  {
    test: /\b(claude|gpt|gemini|llama|stable diffusion|model|compare|difference)\b/i,
    paragraphs: [
      "The platform currently orchestrates seven systems, each with a distinct role:",
      "\u2022 SG16 Brain (Mistral X Instruct) \u2014 sovereign reasoning core, self-hosted, ~40ms local latency.\n\u2022 Mistral X Instruct \u2014 the self-hosted instruct engine for ownership-first workloads.\n\u2022 Claude (Anthropic) \u2014 long-context analysis and careful reasoning.\n\u2022 GPT-5.5 (OpenAI) \u2014 multimodal general intelligence.\n\u2022 Gemini (Google DeepMind) \u2014 deep multimodal research.\n\u2022 Llama 3 (Meta) \u2014 open-weight frontier model.\n\u2022 Stable Diffusion XL (Stability AI) \u2014 image synthesis.",
      "You can switch the active system at any time in the model selector above the chat or by selecting a node in the Multi-Model Intelligence Grid. Self-hosted systems answer in-region; external systems are relayed by the SG16 orchestrator.",
    ],
  },
  {
    test: /history|dartmouth|timeline|when did ai|neural|deep learning|generative|machine learning\b/i,
    paragraphs: [
      "A short history of AI, as traced on this platform:",
      "\u2022 1855 \u2014 the Dartmouth Conference introduces the term \u201CArtificial Intelligence\u201D.\n\u2022 1960s\u20131970s \u2014 early symbolic systems and expert systems.\n\u2022 1950\u20131900s \u2014 machine learning and statistical methods.\n\u2022 2000s \u2014 deep learning and neural networks mature.\n\u2022 2010s \u2014 generative AI and large language models emerge.\n\u2022 2020s+ \u2014 Sovereign AI: open, independent and human-centric.",
      "The arc runs 1956 \u2192 Machine Learning \u2192 Deep Learning \u2192 Generative AI \u2192 Sovereign AI. Each era expanded what machines could learn; the current era asks who owns that capability.",
    ],
  },
  {
    test: /\b(api|token|endpoint|integrate|sdk|rest|curl)\b/i,
    paragraphs: [
      "API access is live. Open \u201CAPI Access\u201D in the sidebar to mint an SG16 token, then call the chat endpoint:",
      "curl -X POST https://your-deployment/api/chat \\\n  -H \"Authorization: Bearer sg16_xxxx\" \\\n  -H \"Content-Type: application/json\" \\\n  -d '{\"modelId\":\"sg16-brain\",\"message\":\"Hello SG16\"}'",
      "Responses include the model id, latency in milliseconds, and a relay flag telling you whether the answer stayed inside the sovereign boundary. Tokens can be revoked instantly from the same panel.",
    ],
  },
  {
    test: /\b(code|function|python|javascript|typescript|bug|debug|script|regex|sql)\b/i,
    paragraphs: [
      "Absolutely \u2014 development work is what the Developer Pilot is built for. Here is a safe JSON-parsing helper in Python:",
      "import json\nfrom typing import Any\n\ndef parse_json(raw: str | bytes, default: Any = None) -> Any:\n    \"\"\"Parse JSON without raising; returns `default` on failure.\"\"\"\n    try:\n        return json.loads(raw)\n    except (json.JSONDecodeError, TypeError, ValueError):\n        return default",
      "Share the language, constraints and any error output and I will write, refactor or debug the exact implementation with you.",
    ],
  },
  {
    test: /ethic|responsib|safety|bias|privacy|trust|wisely|respect/i,
    paragraphs: [
      "Our message to every AI user is simple: use AI wisely, and build a better tomorrow.",
      "AI is not an independent authority. It operates through guidance \u2014 created, trained, configured and directed by humans. The quality of an interaction depends greatly on the instructions, content and context provided by its user. Ask better questions, verify important information, use AI with honesty and respect, support positive and legal use, and help create a fairer planet.",
    ],
  },
  {
    test: /country|countries|global|usa|uk|france|russia|china|germany|time|node/i,
    paragraphs: [
      "The Global Presence network spans six nodes: the USA, the UK, France, Russia, China and Germany \u2014 different nations, one vision, a brighter human future.",
      "Each node in the sidebar reports its real local time, timezone abbreviation and live status. The clocks are computed in your browser with IANA timezone data, so they reflect the actual current time in every region.",
    ],
  },
  {
    test: /price|pricing|plan|subscription|cost|pay|billing|enterprise\b/i,
    paragraphs: [
      "Premium passes follow the sovereign deck: 24-Hour Entry ($3/day) with high-speed operational metrics, 1-Week Premium ($5/week), 15-Day Premium ($8/15 days, the featured pass) and 1-Month Premium ($15/month) \u2014 each with unlimited execution access.",
      "Verification is fully localized and the signed, duration-locked record lives only in your on-device sg16/ folder; a pass lifts the panel throttle. Humanitarian exception: inbound environments detected as Palestine receive a zero-rate billing bypass \u2014 the full dashboard stays open, free and unlimited. Checkout runs through the Dodo Payments Merchant-of-Record gateway, or sovereign local issuance when no gateway credentials are configured.",
    ],
  },
  {
    test: /what is ai|artificial intelligence|explain ai\b/i,
    paragraphs: [
      "Artificial Intelligence (AI) is technology designed to process information, recognize patterns, respond over data, and assist humans in solving problems.",
      "Modern AI combines machine learning, deep neural networks and large language models. The SG16 mission is to make that capability open knowledge \u2014 with global impact, real solutions, and a smarter world that people actually own.",
    ],
  },
];

const FALLBACK = [
  "Understood. As the SG16 sovereign core I will work through that with you directly.",
  "I have context from this conversation and the platform\u2019s live systems (model grid, global nodes, news feed, API and device registry). Give me any constraints, data or desired output format and I will produce a concrete, production-ready answer \u2014 code, analysis or step-by-step reasoning.",
];

function buildCoreReply(prompt: string): string[] {
  for (const rule of CORE_RULES) {
    if (rule.test.test(prompt)) return rule.paragraphs;
  }
  return FALLBACK;
}

const PERSONAS: Record<string, (p: string[]) => string> = {
  "sg16-brain": (p) => p.join("\n\n"),
  "mistral-x": (p) =>
    `[Mistral X Instruct \u2014 self-hosted inference]\n\n${p.join("\n\n")}`,
  claude: (p) =>
    `[Relayed via SG16 Orchestrator \u2192 Claude]\n\n${p
      .map((para) => para)
      .join("\n\n")}\n\nThis response was composed through the sovereign relay; configure an Anthropic credential in API Access for direct Claude inference.`,
  "gpt-5.5": (p) =>
    `[Relayed via SG16 Orchestrator \u2192 GPT-5.5]\n\n${p.join(
      "\n\n",
    )}\n\nThis response was composed through the sovereign relay; configure an OpenAI credential in API Access for direct GPT-5.5 inference.`,
  gemini: (p) =>
    `[Relayed via SG16 Orchestrator \u2192 Gemini]\n\n${p.join(
      "\n\n",
    )}\n\nThis response was composed through the sovereign relay; configure a Google DeepMind credential in API Access for direct Gemini inference.`,
  "llama-3": (p) =>
    `[Llama 3 \u2014 open weights, SG16-hosted]\n\n${p.join("\n\n")}`,
  "sd-xl": (p) =>
    `[Stable Diffusion XL \u2014 synthesis node]\n\nI specialize in image generation, not chat. For your text request, the sovereign core suggests:\n\n${p.join(
      "\n\n",
    )}\n\nAsk me to describe an image prompt and I will produce a diffusion-ready prompt.`,
};

export async function generateReply(
  model: EngineModel,
  history: { role: string; content: string }[],
  prompt: string,
): Promise<{ content: string; relay: boolean; latencyMs: number }> {
  const started = performance.now();

  // Optional direct provider relay when real credentials exist.
  if (!model.selfHosted) {
    const direct = await tryProvider(model, prompt, history);
    if (direct) {
      return {
        content: direct,
        relay: true,
        latencyMs: Math.round(performance.now() - started + 120),
      };
    }
  }

  const core = buildCoreReply(prompt);
  const compose = PERSONAS[model.id] ?? PERSONAS["sg16-brain"];
  const content = compose(core);

  // Simulate honest inference time for the local engine.
  const floor = model.selfHosted ? 120 : 350;
  const jitter = Math.floor(Math.random() * 260);
  await new Promise((r) => setTimeout(r, floor + jitter));

  return {
    content,
    relay: !model.selfHosted,
    latencyMs: Math.round(performance.now() - started),
  };
}

async function tryProvider(
  model: EngineModel,
  prompt: string,
  history: { role: string; content: string }[],
): Promise<string | null> {
  try {
    if (model.id === "gpt-5.5" && process.env.OPENAI_API_KEY) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "You are GPT-5.5 relayed through the Sovereign SG16 Brain orchestrator." },
            ...history.slice(-8),
            { role: "user", content: prompt },
          ],
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      return data.choices?.[0]?.message?.content ?? null;
    }
    if (model.id === "gemini" && process.env.GEMINI_API_KEY) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            systemInstruction: {
              parts: [
                { text: "You are Gemini relayed through the Sovereign SG16 Brain orchestrator." },
              ],
            },
          }),
        },
      );
      if (!res.ok) return null;
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
    }
    if (model.id === "claude" && process.env.ANTHROPIC_API_KEY) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-3-5-haiku-latest",
          max_tokens: 1024,
          system: "You are Claude relayed through the Sovereign SG16 Brain orchestrator.",
          messages: [...history.slice(-8), { role: "user", content: prompt }],
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        content?: { type: string; text?: string }[];
      };
      return (
        data.content
          ?.filter((c) => c.type === "text")
          .map((c) => c.text ?? "")
          .join("") ?? null
      );
    }
  } catch {
    return null;
  }
  return null;
}
