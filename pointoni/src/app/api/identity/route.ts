import { NextRequest, NextResponse } from "next/server";
import {
  bindVerifiedPlan,
  getIdentity,
  planActive,
  requestMagicCode,
  verifyMagicCode,
  verifyToken,
} from "@/lib/identity";
import { PASSES, type PassId } from "@/lib/billing";
import { brainVerifyPass, BrainGatewayError } from "@/lib/brain-gateway";
import { childrenIdentityBlock, childrenPreflight, withChildrenCors } from "@/lib/cors-lock";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function OPTIONS(req: NextRequest) {
  return childrenPreflight(req);
}

function networkKey(req: NextRequest): string {
  // This must be overwritten by the deployment's trusted edge proxy. The
  // application API does not expose the underlying socket peer address.
  const raw =
    req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip")?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown-network";
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function bearer(req: NextRequest): string | null {
  const match = /^Bearer\s+([^\s]+)$/i.exec(req.headers.get("authorization") ?? "");
  return match?.[1] ?? null;
}

export async function GET(req: NextRequest) {
  const blocked = childrenIdentityBlock(req);
  if (blocked) return blocked;
  return NextResponse.json({
    service: "SG16 email identity",
    contract: "A verified email and plan binding are stored by the configured database. A bearer token is held by this browser.",
    storage: "Chat history is stored for signed-in accounts; deployment logs, backups, email delivery and database retention depend on configuration.",
    recovery: "A valid email magic code can restore access on another device.",
    passes: PASSES.map((pass) => ({ id: pass.id, label: pass.label, price: pass.price, hours: pass.hours })),
    mailer: process.env.MAILER_URL ? "configured" : process.env.NODE_ENV === "production" ? "unavailable: MAILER_URL required" : "development code echo",
    signing: process.env.SG16_IDENTITY_SECRET ? "persistent secret configured" : process.env.NODE_ENV === "production" ? "unavailable: SG16_IDENTITY_SECRET required" : "ephemeral per process",
  });
}

export async function POST(req: NextRequest) {
  const blocked = childrenIdentityBlock(req);
  if (blocked) return blocked;

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "JSON object required" }, { status: 400 });
    }
    const action = String(body.action ?? "");
    const rateKey = networkKey(req);

    if (action === "request") {
      const result = await requestMagicCode(String(body.email ?? ""), rateKey);
      return NextResponse.json({ ok: true, sent: true, ...(result.devCode ? { devCode: result.devCode } : {}) });
    }

    if (action === "verify") {
      const result = await verifyMagicCode(String(body.email ?? ""), String(body.code ?? ""), rateKey);
      return NextResponse.json({
        ok: true,
        token: result.token,
        email: result.identity.email,
        plan: planActive(result.identity) ? result.identity.plan : null,
        planExpiresAt: planActive(result.identity) ? result.identity.planExpiresAt : null,
      });
    }

    if (action === "bind") {
      const token = bearer(req);
      const payload = token ? verifyToken(token) : null;
      if (!payload) return NextResponse.json({ ok: false, error: "verified sign-in required" }, { status: 401 });
      const identity = await getIdentity(payload.email);
      if (!identity) return NextResponse.json({ ok: false, error: "identity not found" }, { status: 401 });
      const passToken = typeof body.pass_token === "string" ? body.pass_token : "";
      if (!/^[a-f0-9]{64}$/.test(passToken)) {
        return NextResponse.json({ ok: false, error: "A host-issued pass token is required." }, { status: 400 });
      }
      let verified;
      try {
        verified = await brainVerifyPass(passToken);
      } catch (error) {
        const status = error instanceof BrainGatewayError && error.status === 403 ? 403 : 503;
        return NextResponse.json({ ok: false, error: "The SG16 host could not verify this pass." }, { status });
      }
      const record = verified.record;
      if (
        verified.valid !== true ||
        record.token !== passToken ||
        typeof record.pass !== "string" ||
        !PASSES.some((pass) => pass.id === record.pass) ||
        typeof record.expires_at !== "number"
      ) {
        return NextResponse.json({ ok: false, error: "The SG16 host returned an invalid pass record." }, { status: 403 });
      }
      const updated = await bindVerifiedPlan(
        identity.email,
        record.pass as PassId,
        passToken,
        record.expires_at,
      );
      return NextResponse.json({
        ok: true,
        email: updated.email,
        plan: updated.plan,
        planExpiresAt: updated.planExpiresAt,
      });
    }

    if (action === "me") {
      const payload = verifyToken(bearer(req) ?? "");
      if (!payload) return NextResponse.json({ ok: false, error: "invalid token" }, { status: 401 });
      const identity = await getIdentity(payload.email);
      if (!identity) return NextResponse.json({ ok: false, error: "identity not found" }, { status: 401 });
      return NextResponse.json({
        ok: true,
        email: identity.email,
        plan: planActive(identity) ? identity.plan : null,
        planExpiresAt: identity.planExpiresAt,
        tier: planActive(identity) ? "work" : "free",
      });
    }

    return withChildrenCors(req, NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 }));
  } catch (error) {
    return withChildrenCors(
      req,
      NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : "identity operation failed" },
        { status: 400 },
      ),
    );
  }
}
