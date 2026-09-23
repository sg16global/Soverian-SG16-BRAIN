// ===================================================================
// SG16 CORS CHILDREN LOCK
//
// The Children's Friend (sg16children.com) is a *body*: its own domain, its
// own face, one fetch into the power plant. The charter is blunt about its
// shape — "no login, no email, no capsule, no vault, no analytics", and
// "the /api/identity system is absent by design" (children charter §4).
//
// This module makes that absence *enforced*, not merely un-mounted:
//
//   * only origins on the allow-list may call the brain from a browser
//     (SG16_CHILDREN_ORIGINS, comma separated, never a wildcard);
//   * preflight is answered explicitly, with `Vary: Origin` and no cookies;
//   * children origins are refused by the identity route outright, so even a
//     hand-written fetch from a children shell cannot create a profile;
//   * credentials are never allowed — there is no session to carry.
//
// Nothing here is security theatre: a children shell simply has no identity
// surface to attack, and now no network path to reach one either.
// ===================================================================

import { NextResponse } from "next/server";

export const DEFAULT_CHILDREN_ORIGINS: readonly string[] = [
  "https://sg16children.com",
  "https://www.sg16children.com",
];

export function childrenOrigins(): string[] {
  const raw = process.env.SG16_CHILDREN_ORIGINS?.trim();
  if (!raw) return [...DEFAULT_CHILDREN_ORIGINS];
  return raw
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter((o) => o.length > 0 && o !== "*");
}

function originOf(req: Request): string | null {
  const origin = req.headers.get("origin");
  if (origin) return origin.replace(/\/+$/, "");
  // Same-origin requests from the flagship carry no Origin header; those are
  // not children shells and are handled by the normal path.
  return null;
}

/** True when the caller is a browser shell on the children allow-list. */
export function isChildrenOrigin(req: Request): boolean {
  const origin = originOf(req);
  if (!origin) return false;
  return childrenOrigins().includes(origin);
}

export function isAllowedChildrenOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  return childrenOrigins().includes(origin.replace(/\/+$/, ""));
}

/**
 * Headers a children shell is allowed to receive. No `Access-Control-Allow-
 * Credentials` on purpose: there is no cookie, no token, no session to send.
 * `no-store` avoids intermediary response caching for children turns. Reverse-proxy request logging may still apply.
 */
export function childrenCorsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
    "Cache-Control": "no-store",
  };
}

/**
 * Apply children CORS to an outgoing response. A no-op for every non-children
 * caller, so the flagship keeps its same-origin behaviour untouched.
 */
export function withChildrenCors<T extends NextResponse>(req: Request, res: T): T {
  const origin = originOf(req);
  if (!origin || !isAllowedChildrenOrigin(origin)) return res;
  for (const [key, value] of Object.entries(childrenCorsHeaders(origin))) {
    res.headers.set(key, value);
  }
  return res;
}

/** Explicit preflight for children shells. Other origins get 204 no-store. */
export function childrenPreflight(req: Request): NextResponse {
  const origin = originOf(req);
  if (origin && isAllowedChildrenOrigin(origin)) {
    return new NextResponse(null, { status: 204, headers: childrenCorsHeaders(origin) });
  }
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store", Vary: "Origin" },
  });
}

/**
 * The lock itself: children origins must never reach an identity surface.
 * Returns a response to short-circuit with, or null to continue.
 */
export function childrenIdentityBlock(req: Request): NextResponse | null {
  if (!isChildrenOrigin(req)) return null;
  const origin = originOf(req) as string;
  return NextResponse.json(
    {
      ok: false,
      error:
        "Identity is absent by design in the children's edition — there is no profile to create, fetch or recover.",
      charter: "SG16 Children Charter §4 — no login, no email, no capsule, no vault",
    },
    { status: 403, headers: childrenCorsHeaders(origin) },
  );
}

/** Reporting for /api/health and operator docs (never leaks secrets). */
export function childrenLockSummary() {
  return {
    origins: childrenOrigins(),
    credentials: false,
    identity: "blocked for children origins",
  };
}
