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
} from "@/lib/brain-gateway";
import { OllamaBridgeError, ollamaChat, ollamaEnabled, ollamaHealth } from "@/lib/ollama-brain";
import { charterDigest, type CharterBody } from "@/lib/charter-prompt";
import { warmFallbackLine, warmRateLimitLine, tierChip } from "@/lib/warm-alias";
import { childrenPreflight, isChildrenOrigin, withChildrenCors } from "@/lib/cors-lock";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// /api/brain — the sovereign chat routing point.
//
// Same request/response contract as /api/chat so the ChatPanel UI and the
// session archive stay 100% compatible, but self-hosted models are answered
// by the SG16 core itself (Q16.16 mathematics through the master door),
// reached server-side via the brain gateway. Non-self-hosted grid models keep
// their orchestrator relay behavior. If the core link is down, the request
// is still answered locally and flagged `brain: "fallback-local"` so the
// interface never strands the pilot.

type BrainSource = "core" | "ollama" | "fallback-local" | "relay";

// Fallback order is the doctrine's, top to bottom:
//   core      → the Q16.16 sovereign runtime on the operator's own host
//   ollama    → the local heart-bridge (operator's own metal, zero vendor API)
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
  // a children shell cannot ask to be treated as the flagship.
  const children = isChildrenOrigin(req);
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

  const body = (await req.json().catch(() => null)) as {
    sessionId?: unknown;
    modelId?: unknown;
    message?: unknown;
    forgetSessionId?: unknown;
  } | null;

  if (typeof body?.forgetSessionId === "string") {
    const forgetId = body.forgetSessionId;
    if (forgetId.length > 64) return json({ error: "Session id is invalid." }, { status: 400 });
    await brainForgetSession(forgetId);
    return json({ ok: true, hostContext: "reset", storedHistory: "unchanged" });
  }

  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const modelId = typeof body?.modelId === "string" ? body.modelId : "sg16-brain";
  if (!message) {
    return json({ error: "Message is required." }, { status: 400 });
  }
  if (message.length > MAX_BRAIN_MESSAGE_CHARS) {
    return json(
      { error: `Message too long (${MAX_BRAIN_MESSAGE_CHARS} character limit).` },
      { status: 413 },
    );
  }

  await ensureSeeded();
  const account = children ? null : await resolveAccount(req);
  const modelRows = await db.select().from(aiModels).where(eq(aiModels.id, modelId)).limit(1);
  const model = modelRows[0];
  if (!model) {
    return json({ error: "Unknown model." }, { status: 404 });
  }

  // ---- the thinking ladder: core → heart-bridge → guard → relay ----------
  // One ladder, used by every body. A turn reports which runtime actually
  // answered (`brain`), so the interface never dresses a lesser engine up as
  // the core (charter §10 honest claims, §19 intellectual honesty).
  const think = async (
    text: string,
    sessionId: string | null,
  ): Promise<{ content: string; brain: BrainSource; relay: boolean }> => {
    if (!model.selfHosted) {
      // External grid systems stay on the orchestrator relay path.
      const historyRows = sessionId
        ? await db
            .select({ role: chatMessages.role, content: chatMessages.content })
            .from(chatMessages)
            .where(eq(chatMessages.sessionId, sessionId))
            .orderBy(asc(chatMessages.createdAt))
            .limit(20)
        : [];
      const local = await generateReply(
        { id: model.id, name: model.name, vendor: model.vendor, selfHosted: false },
        sessionId ? historyRows.slice(0, -1) : [],
        text,
      );
      return { content: local.content, brain: "relay", relay: true };
    }

    try {
      // Sovereign path: the SG16 core answers through its master door.
      const passToken = account?.identity && planActive(account.identity)
        ? account.identity.planToken
        : null;
      const transaction = await brainChat(
        text,
        sessionId ?? `ephemeral-${randomUUID()}`,
        passToken,
      );
      return { content: transaction.reply, brain: "core", relay: false };
    } catch (err) {
      const detail = err instanceof BrainGatewayError ? err.message : "core link down";

      // Second in the order: the operator's own heart-bridge. Same machine,
      // same law, zero vendor contract — tried before settling for the guard.
      if (ollamaEnabled()) {
        try {
          const turn = await ollamaChat({
            message: text,
            body: bodyKind,
            tier: tierInfo.tier,
            context: null,
          });
          return { content: turn.reply, brain: "ollama", relay: false };
        } catch (bridgeErr) {
          if (!(bridgeErr instanceof OllamaBridgeError)) throw bridgeErr;
        }
      }

      // The charter guarantees patience and availability: degrade to the local
      // guard engine instead of failing the pilot, and say so warmly.
      const local = await generateReply(
        { id: model.id, name: model.name, vendor: model.vendor, selfHosted: true },
        [],
        text,
      );
      return {
        content: [warmFallbackLine("fallback-local", detail), local.content].join("\n\n"),
        brain: "fallback-local",
        relay: false,
      };
    }
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
