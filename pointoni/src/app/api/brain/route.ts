import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db, persistenceMode } from "@/db";
import { aiModels, chatMessages, chatSessions } from "@/db/schema";
import { and, asc, desc, eq } from "drizzle-orm";
import { ensureSeeded } from "@/lib/seed";
import { resolveAccount } from "@/lib/account-auth";
import { generateReply } from "@/lib/ai-engine";
import { consumeBucket, planActive, resolveTier } from "@/lib/identity";
import {
  BrainGatewayError,
  MAX_BRAIN_MESSAGE_CHARS,
  brainChat,
  brainForgetSession,
  brainHealth,
  brainIntrospect,
} from "@/lib/brain-gateway";
import { ollamaChat, ollamaEnabled, ollamaHealth, ollamaTimeoutMs } from "@/lib/ollama-brain";
import { clientIdentity, sharedRateLimiter } from "@/lib/rate-limit";
import { checkHuman, sharedHumanDeps, turnstileAppliesTo, turnstileEnabled, turnstileSiteKey } from "@/lib/turnstile";
import { CHILD_MAX_NEW_TOKENS, childHooks } from "@/lib/child-safety";
import { BUSY_TEXT, answerMetrics, lastAnswer, queueWaitMs, recordAnswer, runLadder, sharedLimiter, type Engine } from "@/lib/answer-ladder";
import { charterDigest, type CharterBody } from "@/lib/charter-prompt";
import { warmFallbackLine, warmRateLimitLine, tierChip } from "@/lib/warm-alias";
import { childrenPreflight, isChildrenOrigin, withChildrenCors } from "@/lib/cors-lock";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SG16_MODEL_ID = "sg16-brain";

function rateLimitedLine(child: boolean, scope: "visitor" | "global"): string {
  if (scope === "global") return "I'm very busy right now - please try again in a moment.";
  return child
    ? "Wow, that's a lot of questions! Let's take a tiny rest and try again in a moment."
    : "You're sending messages very quickly - please wait a few seconds and try again.";
}

// a chat message is at most 8k chars; anything near this size is not a chat
const MAX_BODY_BYTES = 64 * 1024;

// /api/brain — the sovereign chat routing point.
//
// Same request/response contract as /api/chat so the ChatPanel UI and the
// session archive stay 100% compatible, but self-hosted models are answered
// by the SG16 core itself (Q16.16 mathematics through the master door),
// reached server-side via the brain gateway. Non-self-hosted grid models keep
// their orchestrator relay behavior. If the core link is down, the request
// is still answered locally and flagged `brain: "fallback-local"` so the
// interface never strands the pilot.

type BrainSource = Engine;

// The ladder, top to bottom (see lib/answer-ladder.ts):
//   core gate → screens the message first; blocked gets the core's refusal
//   ollama    → Mistral on the operator's own metal answers clean messages
//   core      → the deterministic Q16.16 runtime if Ollama fails or times out
//   fallback  → the local guard channel so the pilot is never stranded
// A children shell is a *body*: no identity, and it never hears about money.
//
// OPTIONS — children shells are cross-origin by design, so preflight is
// answered explicitly and only for origins on the allow-list.
export async function OPTIONS(req: NextRequest) {
  return childrenPreflight(req);
}

// GET /api/brain?probe=health        -> core reachability + stack status
// GET /api/brain?sessions=1          -> session list
// GET /api/brain?session=<id>        -> messages for a session
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // whether the page should show the Turnstile widget (the site key is public by design)
  if (searchParams.get("probe") === "turnstile") {
    return withChildrenCors(
      req,
      NextResponse.json({
        enabled: turnstileEnabled() && turnstileAppliesTo(isChildrenOrigin(req)),
        siteKey: turnstileAppliesTo(isChildrenOrigin(req)) ? turnstileSiteKey() : null,
      }),
    );
  }

  if (searchParams.get("probe") === "health") {
    // The pilot deserves the whole honest picture: the core first, then the
    // heart-bridge, plus which law the answer would be spoken under.
    const heart = await ollamaHealth();
    try {
      const health = await brainHealth();
      return NextResponse.json({
        ok: true,
        brain: "online",
        persistence: persistenceMode,
        core: health,
        heart,
        lastAnswered: lastAnswer(),
        metrics: answerMetrics(),
        charter: charterDigest(),
      });
    } catch (err) {
      const status = err instanceof BrainGatewayError && err.status === 429 ? 429 : 503;
      return NextResponse.json(
        {
          ok: false,
          brain: "offline",
          // the bridge may still be holding the platform up on its own
          degradedTo: ollamaEnabled() && heart.status === "online" ? "ollama" : null,
          persistence: persistenceMode,
          heart,
          charter: charterDigest(),
          error: err instanceof Error ? err.message : "core unreachable",
        },
        { status },
      );
    }
  }

  const sessionId = searchParams.get("session");

  // A children shell never reads the flagship's archive. The children edition
  // keeps its history on its own device and is never handed an account archive.
  if (isChildrenOrigin(req)) {
    if (sessionId) {
      return withChildrenCors(
        req,
        NextResponse.json({ error: "No server-side child archive is available.", friend: true, stored: false }, { status: 403 }),
      );
    }
    return withChildrenCors(req, NextResponse.json({ sessions: [], friend: true, stored: false }));
  }

  const account = await resolveAccount(req);
  if (!account) {
    return NextResponse.json({ error: "Sign in to access saved conversations." }, { status: 401 });
  }

  if (sessionId) {
    const sessions = await db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, account.user.id)))
      .limit(1);
    if (!sessions[0]) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    const messages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(asc(chatMessages.createdAt));
    return NextResponse.json({ session: sessions[0], messages });
  }

  const sessions = await db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.userId, account.user.id))
    .orderBy(desc(chatSessions.updatedAt))
    .limit(50);
  return NextResponse.json({ sessions });
}

// POST { sessionId?, modelId, message } | { forgetSessionId }
// Tier gate: free guests share a fair-use hourly bucket per device-IP; a
// bound subscriber (Bearer identity/API token) enters WORK mode —
// wider process-local bucket, same configured core path.
export async function POST(req: NextRequest) {
  // A body's shape is decided by its origin, never by its request body:
  // a children shell cannot ask to be treated as the flagship. The body may
  // only ever tighten that: audience "child" from ANY origin selects the
  // children's path (stricter prompt, checks, no storage); no field loosens it.
  const originChildren = isChildrenOrigin(req);

  // Refuse oversized bodies before reading them (messages are capped at 8k chars).
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return withChildrenCors(
      req,
      NextResponse.json({ error: "That message is too big to send." }, { status: 413 }),
    );
  }

  // Per-visitor limit, before any body parsing or database work. The visitor key
  // is a salted hash held in memory only; nothing about the visitor is stored or
  // logged. Over the limit is a friendly 429, never an error page.
  const decision = sharedRateLimiter().check(clientIdentity(req.headers));
  if (!decision.ok) {
    recordAnswer("rate-limited");
    return withChildrenCors(
      req,
      NextResponse.json(
        {
          error: rateLimitedLine(originChildren, decision.scope),
          rateLimited: true,
          friend: originChildren,
          retryAt: Date.now() + decision.retryAfterSec * 1000,
        },
        { status: 429, headers: { "Retry-After": String(decision.retryAfterSec) } },
      ),
    );
  }
  const body = (await req.json().catch(() => null)) as {
    sessionId?: unknown;
    modelId?: unknown;
    message?: unknown;
    forgetSessionId?: unknown;
    audience?: unknown;
    turnstileToken?: unknown;
    humanToken?: unknown;
  } | null;
  const children = originChildren || body?.audience === "child";
  const bodyKind: CharterBody = children ? "children" : "flagship";

  const tierInfo = await resolveTier(req);
  const bucket = consumeBucket(tierInfo.bucketKey, tierInfo.limit);
  const rateHeaders = {
    "X-Chat-Tier": children ? "friend" : tierInfo.tier,
    "X-RateLimit-Limit": String(tierInfo.limit),
    "X-RateLimit-Remaining": String(bucket.remaining),
  };
  // every response from here on carries the children lock when applicable
  const json = (payload: unknown, init?: { status?: number; headers?: Record<string, string> }) =>
    withChildrenCors(
      req,
      NextResponse.json(payload, {
        status: init?.status,
        headers: { ...rateHeaders, ...(init?.headers ?? {}) },
      }),
    );

  if (!bucket.ok) {
    // Charter §5: no work-mode pressure in the children edition — the pause is
    // warm, never a sales pitch.
    return json(
      {
        error: warmRateLimitLine(bodyKind, tierInfo.tier),
        tier: tierInfo.tier,
        friend: children,
        tierChip: tierChip(bodyKind, tierInfo.tier),
        retryAt: bucket.resetAt,
      },
      { status: 429 },
    );
  }

  if (typeof body?.forgetSessionId === "string") {
    const forgetId = body.forgetSessionId;
    if (forgetId.length > 64) return json({ error: "Session id is invalid." }, { status: 400 });
    await brainForgetSession(forgetId);
    return json({ ok: true, hostContext: "reset", storedHistory: "unchanged" });
  }

  const message = typeof body?.message === "string" ? body.message.trim() : "";
  // Chat is locked to the SG16 brain. A modelId in the request is ignored: there is
  // no relay to any other model, for anyone.
  const modelId = SG16_MODEL_ID;
  if (!message) {
    return json({ error: "Message is required." }, { status: 400 });
  }
  if (message.length > MAX_BRAIN_MESSAGE_CHARS) {
    return json(
      { error: `Message too long (${MAX_BRAIN_MESSAGE_CHARS} character limit).` },
      { status: 413 },
    );
  }

  // Optional Cloudflare Turnstile (off unless both keys are set). Fails open to
  // the rate limiter if Cloudflare cannot be reached.
  // The children's edition promises no third-party scripts, so it is only
  // challenged if the operator opts in with TURNSTILE_ON_CHILDREN=1.
  const human = turnstileAppliesTo(children)
    ? await checkHuman(
        { turnstileToken: body?.turnstileToken, humanToken: body?.humanToken },
        sharedHumanDeps(),
      )
    : ({ ok: true } as const);
  if (!human.ok) {
    return json(
      { error: "Please complete the quick check below, then send your message again.", turnstileRequired: true },
      { status: 403 },
    );
  }
  const humanExtra = "humanToken" in human && human.humanToken ? { humanToken: human.humanToken } : {};

  await ensureSeeded();
  const account = children ? null : await resolveAccount(req);
  const modelRows = await db.select().from(aiModels).where(eq(aiModels.id, modelId)).limit(1);
  const model = modelRows[0];
  if (!model) {
    return json({ error: "Unknown model." }, { status: 404 });
  }
  // Queue full: answer at once instead of hanging, and before anything is stored.
  if (ollamaEnabled() && sharedLimiter().saturated()) {
    recordAnswer("busy");
    return json({ error: BUSY_TEXT, busy: true, brain: "busy" }, { status: 503, headers: { "Retry-After": "3" } });
  }

  // ---- the thinking ladder: core → heart-bridge → guard → relay ----------
  // One ladder, used by every body. A turn reports which runtime actually
  // answered (`brain`), so the interface never dresses a lesser engine up as
  // the core (charter §10 honest claims, §19 intellectual honesty).
  const think = async (
    text: string,
    sessionId: string | null,
  ): Promise<{ content: string; brain: BrainSource; relay: boolean }> => {
    const passToken = (account?.identity && planActive(account.identity)
      ? account.identity.planToken
      : null) ?? tierInfo.passToken;
    const startedAt = performance.now();
    const result = await runLadder(text, {
      // 1. the core's gate screens every message before any model sees it
      gate: brainIntrospect,
      // 2. Mistral via Ollama answers clean messages. The system prompt is the
      //    same for every request of a body (no tier, no context) so Ollama
      //    can reuse the cached prompt start.
      ollama: ollamaEnabled()
        ? async (t) =>
            (
              await ollamaChat({
                message: t,
                body: bodyKind,
                maxTokens: children ? CHILD_MAX_NEW_TOKENS : undefined,
              })
            ).reply
        : null,
      // 3. deterministic core when Ollama fails or times out
      core: async (t) =>
        (await brainChat(t, sessionId ?? `ephemeral-${randomUUID()}`, passToken)).reply,
      // 4. local guard engine so the pilot is never stranded
      local: async (t, detail) => {
        const local = await generateReply(t);
        return [warmFallbackLine("fallback-local", detail), local.content].join("\n\n");
      },
      limiter: sharedLimiter(),
      child: children ? childHooks(brainIntrospect) : undefined,
      queueWaitMs: queueWaitMs(),
      // the bridge aborts its own fetch at ollamaTimeoutMs; this is the backstop
      ollamaTimeoutMs: ollamaTimeoutMs() + 5_000,
      signal: req.signal,
    });
    recordAnswer(result.engine, result.engine === "busy" ? undefined : performance.now() - startedAt);
    return { content: result.content, brain: result.engine, relay: false };
  };

  // ---- the children's edition: nothing is written down -------------------
  // Charter §4: no login, no email, no capsule, no vault. That "no vault" is
  // enforced here — no session row, no message row, no stored transcript. The
  // core session id is fresh per turn, so no two children ever share context
  // and no conversation can be continued server-side. The child's device
  // holds its own memory, exactly as the charter promises.
  if (children) {
    const started = performance.now();
    const turn = await think(message, null);
    return json({
      sessionId: null,
      userMessage: { role: "user", content: message },
      assistantMessage: {
        role: "assistant",
        content: turn.content,
        latencyMs: Math.round(performance.now() - started),
      },
      brain: turn.brain,
      tier: tierInfo.tier,
      friend: true,
      tierChip: tierChip(bodyKind, tierInfo.tier),
      stored: false,
      ...humanExtra,
    });
  }

  const requestedSession = typeof body?.sessionId === "string" ? body.sessionId : null;
  if (requestedSession && requestedSession.length > 64) {
    return json({ error: "Session id is invalid." }, { status: 400 });
  }

  if (account) {
    let sessionId: string;
    if (requestedSession) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedSession)) {
        return json({ error: "Conversation not found." }, { status: 404 });
      }
      const owned = await db
        .select({ id: chatSessions.id })
        .from(chatSessions)
        .where(and(eq(chatSessions.id, requestedSession), eq(chatSessions.userId, account.user.id)))
        .limit(1);
      if (!owned[0]) return json({ error: "Conversation not found." }, { status: 404 });
      sessionId = requestedSession;
    } else {
      const created = await db
        .insert(chatSessions)
        .values({
          userId: account.user.id,
          title: message.slice(0, 56) + (message.length > 56 ? "\u2026" : ""),
          modelId: model.id,
        })
        .returning();
      sessionId = created[0].id;
    }

    const insertedUser = await db
      .insert(chatMessages)
      .values({ sessionId, role: "user", content: message, modelId: model.id })
      .returning();
    const started = performance.now();
    const turn = await think(message, sessionId);
    const latencyMs = Math.round(performance.now() - started);
    const insertedAssistant = await db
      .insert(chatMessages)
      .values({
        sessionId,
        role: "assistant",
        content: turn.content,
        modelId: model.id,
        relay: turn.relay,
        latencyMs,
      })
      .returning();
    await db
      .update(chatSessions)
      .set({ updatedAt: new Date(), modelId: model.id })
      .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, account.user.id)));

    return json({
      sessionId,
      userMessage: insertedUser[0],
      assistantMessage: insertedAssistant[0],
      brain: turn.brain,
      tier: tierInfo.tier,
      friend: false,
      stored: true,
      tierChip: tierChip(bodyKind, tierInfo.tier),
      ...humanExtra,
    });
  }

  // Unauthenticated flagship use is supported without storing the transcript
  // in the account database. A high-entropy guest handle lets the core retain
  // short in-memory context; it is not an archive or an authentication factor.
  const guestSessionId = requestedSession && /^guest-[0-9a-f-]{36}$/i.test(requestedSession)
    ? requestedSession
    : `guest-${randomUUID()}`;
  const started = performance.now();
  const turn = await think(message, guestSessionId);
  const now = new Date().toISOString();
  const latencyMs = Math.round(performance.now() - started);
  return json({
    sessionId: guestSessionId,
    userMessage: {
      id: randomUUID(), sessionId: guestSessionId, role: "user", content: message,
      modelId: model.id, relay: false, latencyMs: 0, createdAt: now,
    },
    assistantMessage: {
      id: randomUUID(), sessionId: guestSessionId, role: "assistant", content: turn.content,
      modelId: model.id, relay: turn.relay, latencyMs, createdAt: now,
    },
    brain: turn.brain,
    tier: tierInfo.tier,
    friend: false,
    stored: false,
    tierChip: tierChip(bodyKind, tierInfo.tier),
    ...humanExtra,
  });
}
// DELETE /api/brain?session=<id>
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("session");
  if (!sessionId) {
    return withChildrenCors(
      req,
      NextResponse.json({ error: "session id required" }, { status: 400 }),
    );
  }
  const account = await resolveAccount(req);
  if (!account) return NextResponse.json({ error: "Sign in to delete saved conversations." }, { status: 401 });
  const deleted = await db
    .delete(chatSessions)
    .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, account.user.id)))
    .returning({ id: chatSessions.id });
  if (!deleted[0]) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  await brainForgetSession(sessionId);
  return withChildrenCors(req, NextResponse.json({ ok: true, coreContextMayRemain: true }));
}
