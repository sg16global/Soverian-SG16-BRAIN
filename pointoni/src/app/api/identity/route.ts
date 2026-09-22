import { NextRequest, NextResponse } from "next/server";
import {
  bindPlan,
  getIdentity,
  planActive,
  requestMagicCode,
  verifyMagicCode,
  verifyToken,
} from "@/lib/identity";
import { PASSES } from "@/lib/billing";
import { childrenIdentityBlock, childrenPreflight, withChildrenCors } from "@/lib/cors-lock";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Children shells are cross-origin by design (their own domain, one fetch),
// so preflight is answered before the lock refuses them.
export async function OPTIONS(req: NextRequest) {
  return childrenPreflight(req);
}

// SOVEREIGN IDENTITY API — email-only, magic-code sign-in.
//  POST { action: "request", email }              → sends a 6-digit code
//  POST { action: "verify", email, code }         → sovereign token (30d)
//  POST { action: "bind", email, pass, token }    → vault a billing pass to the email
//  POST { action: "me", token }                   → current identity + plan state
// Zero-profile contract: we store the email and the plan binding — nothing else.

export async function GET(req: NextRequest) {
  // Charter §4: the children's edition has no identity surface at all. The
  // lock is enforced here, not merely un-mounted in the UI.
  const blocked = childrenIdentityBlock(req);
  if (blocked) return blocked;

  return NextResponse.json({
    service: "SG16 Sovereign Identity",
    contract: "email-only — no passwords, no names, no telemetry, one column of identity",
    storage: "email + plan binding only; conversations stay on your device and your capsule",
    recovery: "lost device or folder → magic code by email → subscription re-attaches anywhere",
    passes: PASSES.map((p) => ({ id: p.id, label: p.label, price: p.price, hours: p.hours })),
    mailer: process.env.MAILER_URL ? "smtp-relay configured" : "dev-echo mode (codes returned in response)",
  });
}

export async function POST(req: NextRequest) {
  // Same lock on writes: a children shell cannot mint, bind or read an
  // identity — there is nothing to protect because nothing is collected.
  const blocked = childrenIdentityBlock(req);
  if (blocked) return blocked;

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");

    if (action === "request") {
      const r = await requestMagicCode(String(body.email ?? ""));
      return NextResponse.json({ ok: true, sent: true, ...(r.devCode ? { devCode: r.devCode } : {}) });
    }

    if (action === "verify") {
      const { token, identity } = await verifyMagicCode(String(body.email ?? ""), String(body.code ?? ""));
      return NextResponse.json({
        ok: true,
        token,
        email: identity.email,
        plan: planActive(identity) ? identity.plan : null,
        planExpiresAt: planActive(identity) ? identity.planExpiresAt : null,
      });
    }

    if (action === "bind") {
      const identity = await bindPlan(
        String(body.email ?? ""),
        String(body.pass ?? "") as Parameters<typeof bindPlan>[1],
        String(body.token ?? "vaulted-client-side"),
      );
      return NextResponse.json({
        ok: true,
        email: identity.email,
        plan: identity.plan,
        planExpiresAt: identity.planExpiresAt,
      });
    }

    if (action === "upsert") {
      const identity = await getIdentity(String(body.email ?? ""));
      return NextResponse.json({ ok: true, exists: !!identity });
    }

    if (action === "me") {
      const payload = verifyToken(String(body.token ?? ""));
      if (!payload) return NextResponse.json({ ok: false, error: "invalid token" }, { status: 401 });
      const identity = await getIdentity(payload.email);
      return NextResponse.json({
        ok: true,
        email: payload.email,
        plan: planActive(identity) ? identity?.plan : null,
        planExpiresAt: identity?.planExpiresAt ?? null,
        tier: planActive(identity) ? "work" : "free",
      });
    }

    return withChildrenCors(
      req,
      NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 }),
    );
  } catch (err) {
    return withChildrenCors(
      req,
      NextResponse.json(
        { ok: false, error: err instanceof Error ? err.message : "identity op failed" },
        { status: 400 },
      ),
    );
  }
}
