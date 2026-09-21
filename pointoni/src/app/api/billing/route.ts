import { NextRequest, NextResponse } from "next/server";
import {
  BrainGatewayError,
  brainCheckout,
  brainGetBilling,
} from "@/lib/brain-gateway";
import { HUMANITARIAN_REGION, PASSES } from "@/lib/billing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// /api/billing — the sovereign checkout routing point.
//
// GET  -> the pass deck + live gateway mode from the core host
// POST -> one pass through the core's Dodo Payments MoR pipeline
//         (sovereign local issuance when the gateway has no credentials;
//          the humanitarian region is intercepted before the gateway runs)

const PASS_IDS: ReadonlySet<string> = new Set(PASSES.map((p) => p.id));

export async function GET() {
  try {
    const info = await brainGetBilling();
    return NextResponse.json({ ok: true, source: "core", billing: info });
  } catch (err) {
    // Core offline: answer the deck from the ported constants so the
    // subscription area still renders; checkout will degrade likewise.
    return NextResponse.json({
      ok: true,
      source: "local-constants",
      billing: {
        currency: "USD",
        humanitarian_region: HUMANITARIAN_REGION,
        passes: Object.fromEntries(
          PASSES.map((p) => [p.id, { label: p.label, price: p.price, hours: p.hours }]),
        ),
        owner_bypass: "token_accounting+throttles only; safety never",
        gateway: {
          provider: "dodo-payments",
          model: "merchant-of-record",
          mode: "core-offline",
        },
        error: err instanceof BrainGatewayError ? err.message : "core unreachable",
      },
    });
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    pass?: string;
    region?: string | null;
    provider?: string;
    return_url?: string;
    session_id?: string;
  } | null;

  const passId = body?.pass ?? "";
  if (!PASS_IDS.has(passId)) {
    return NextResponse.json({ error: "unknown pass tier" }, { status: 400 });
  }
  // Region is never taken raw from the client beyond a fixed allowlist-style
  // shape: a short printable string or null. The core re-derives all pricing.
  const region =
    typeof body?.region === "string" && body.region.length <= 64
      ? body.region
      : null;

  try {
    const result = await brainCheckout({
      pass: passId,
      region,
      provider: typeof body?.provider === "string" ? body.provider.slice(0, 32) : "guest",
      return_url:
        typeof body?.return_url === "string" ? body.return_url.slice(0, 512) : undefined,
      session_id:
        typeof body?.session_id === "string" ? body.session_id.slice(0, 64) : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    const status = err instanceof BrainGatewayError && err.status ? err.status : 503;
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "core checkout unavailable",
        fallback: "local-device",
      },
      { status: status === 400 ? 400 : 503 },
    );
  }
}
