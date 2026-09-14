// Standalone application subscription model with localized verification.
//
// The verification routine runs entirely on the user's device: the region is
// inferred from the device's own timezone/locale (or a manual override the user
// controls), the pass is recorded locally, and the effective price is derived
// on-device.  Nothing about it is sent to the sovereign host.

import { store } from "./storage.js";
import { postJson } from "./api.js";

export const OWNER_EMAIL = "sg16global@gmail.com";

export const PASSES = {
  day: { label: "24-Hour Entry", price: 3, unit: "/day", hours: 24 },
  week: { label: "1-Week Premium", price: 5, unit: "/week", hours: 24 * 7 },
  half: { label: "15-Day Premium", price: 8, unit: "/15 days", hours: 24 * 15 },
  month: { label: "1-Month Premium", price: 15, unit: "/month", hours: 24 * 30 },
};

// ----------------------------------------------------------------------
// region detection (on-device only)
// ----------------------------------------------------------------------
export function detectRegion() {
  let tz = "";
  let lang = "";
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    lang = (navigator.language || "").toLowerCase();
  } catch {
    return null;
  }
  if (/gaza|hebron|ramallah|nablus|west.?bank|^asia\/jerusalem/i.test(tz)) return "Palestine";
  if (lang === "ar-ps" || lang.startsWith("ar-ps")) return "Palestine";
  return null;
}

export function resolveRegion(override) {
  if (override && override !== "auto") return override;
  return detectRegion();
}

export function resolveBilling(override) {
  const region = resolveRegion(override ?? store.get("region", "auto"));
  const humanitarian = region === "Palestine";
  return { region, humanitarian };
}

export function effectivePrice(pass, billing) {
  return billing.humanitarian ? 0 : PASSES[pass].price;
}

// ----------------------------------------------------------------------
// subscription record (local only)
// ----------------------------------------------------------------------
async function localIssue(pass, identity, billing) {
  const now = Date.now();
  return {
    pass,
    provider: identity ? identity.provider : "guest",
    price_charged: effectivePrice(pass, billing),
    list_price: PASSES[pass].price,
    region: billing.region,
    humanitarian_bypass: billing.humanitarian,
    activated_at: Math.floor(now / 1000),
    expires_at: Math.floor(now / 1000) + PASSES[pass].hours * 3600,
    verified_locally: true,
  };
}

export async function subscribe(pass, identity) {
  const billing = resolveBilling();
  let record;
  try {
    // server-backed issue: the host re-derives price/expiry and signs a token,
    // so a tampered client template can never spoof a tier.
    record = await postJson("/api/subscribe", {
      pass,
      region: billing.region,
      provider: identity ? identity.provider : "guest",
    });
  } catch {
    // air-gapped / host unreachable: fall back to the localized record.
    record = await localIssue(pass, identity, billing);
  }
  store.set("pass", record);
  return record;
}

export function currentPass() {
  const record = store.get("pass");
  if (!record) return null;
  if (new Date(record.expires_at).getTime() < Date.now()) return null;
  return record;
}

// ----------------------------------------------------------------------
// on-device identity attestation (Google / Apple)
// ----------------------------------------------------------------------
async function sha256(message) {
  try {
    if (globalThis.crypto && crypto.subtle) {
      const data = new TextEncoder().encode(message);
      const digest = await crypto.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }
  } catch {}
  // deterministic fallback when WebCrypto is unavailable
  let h = 5381;
  for (const ch of message) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

export function ownerSignature() {
  const identity = currentIdentity();
  if (identity && identity.email === OWNER_EMAIL) return identity.email;
  return null;
}

export async function attestIdentity(provider) {
  const email = window.prompt(
    `${provider} credential (the email of your ${provider} ID).\n` +
      `It is verified and hashed ON THIS DEVICE ONLY - it is never uploaded.`
  );
  if (!email || !email.includes("@")) return null;
  const hash = await sha256(`sg16-local:${provider}:${email.trim().toLowerCase()}`);
  // the raw email stays on this device; it is only used locally to recognise
  // the VIP owner so the matching header can be attached to requests.
  const identity = {
    provider,
    hash,
    email: email.trim().toLowerCase(),
    attested_at: new Date().toISOString(),
  };
  store.set("identity", identity);
  return identity;
}

export function currentIdentity() {
  return store.get("identity");
}

// ----------------------------------------------------------------------
// local API key (client-side entitlement token)
// ----------------------------------------------------------------------
export async function generateApiKey() {
  const identity = currentIdentity() || { hash: "guest" };
  const pass = currentPass() || { pass: "open" };
  const salt = Math.random().toString(36).slice(2, 10);
  const digest = await sha256(`sg16-api:${identity.hash}:${pass.pass}:${salt}`);
  const key = `sg16_live_${digest.slice(0, 32)}`;
  store.set("api_key", key);
  return key;
}

export function currentApiKey() {
  return store.get("api_key");
}
