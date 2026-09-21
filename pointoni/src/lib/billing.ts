// Subscription model — ported verbatim from the old sovereign system
// (sg16/billing.py authoritative host mirror + web/src/billing.js client).
//
// Tiers (identical on both sides, mapped one-to-one onto Dodo Payments
// Merchant-of-Record checkout products):
//
//   day   24-Hour Entry    $3   24 h
//   week  1-Week Premium   $5   7 d
//   half  15-Day Premium   $8   15 d
//   month 1-Month Premium  $15  30 d
//
// Humanitarian rule: region "Palestine" is a zero-rate billing bypass
// evaluated BEFORE the gateway is ever contacted — the full dashboard stays
// open, free and unlimited.  Gateway: Dodo Payments MoR when credentials are
// configured, otherwise sovereign local issuance (same signed, duration-
// locked records).

export type PassId = "day" | "week" | "half" | "month";

export type PassSpec = {
  id: PassId;
  label: string;
  price: number;
  unit: string;
  hours: number;
  blurb: string;
  accent: string;
  featured?: boolean;
};

export const PASSES: readonly PassSpec[] = [
  {
    id: "day",
    label: "24-Hour Entry",
    price: 3,
    unit: "/day",
    hours: 24,
    blurb: "Full 24-hour access with high-speed operational metrics.",
    accent: "#39d7ff",
  },
  {
    id: "week",
    label: "1-Week Premium",
    price: 5,
    unit: "/week",
    hours: 24 * 7,
    blurb: "Unlimited execution access.",
    accent: "#b06bff",
  },
  {
    id: "half",
    label: "15-Day Premium",
    price: 8,
    unit: "/15 days",
    hours: 24 * 15,
    blurb: "Unlimited execution access.",
    accent: "#22e08c",
    featured: true,
  },
  {
    id: "month",
    label: "1-Month Premium",
    price: 15,
    unit: "/month",
    hours: 24 * 30,
    blurb: "Absolute unlimited execution access.",
    accent: "#ffd166",
  },
] as const;

export const HUMANITARIAN_REGION = "Palestine";

export const BILLING_COPY = {
  deckTitle: "Standalone application \u00B7 premium passes",
  localizedNote:
    "Localized verification runs entirely on your device. Your credentials and history never leave it.",
  humanitarianNote:
    "Humanitarian exception: inbound environments detected as Palestine receive a zero-rate billing bypass \u2014 the full dashboard stays open, free and unlimited.",
  noPassNote:
    "No active pass. The brain still answers; a pass lifts the panel throttle.",
  gatewayNote:
    "Checkout runs through the Dodo Payments Merchant-of-Record gateway when operator credentials are configured; otherwise the sovereign host signs the same duration-locked records locally. Either way the record lives only in your on-device sg16/ storage directory \u2014 100% data residency, zero client logs.",
  regionDetectNote:
    "Verification is fully localized: region is inferred from this device's own timezone and locale, and the signed record lives only in your sg16/ folder.",
} as const;

export type PassRecord = {
  pass: PassId;
  provider: string;
  price_charged: number;
  list_price?: number;
  region: string | null;
  humanitarian_bypass?: boolean;
  vip_owner_bypass?: boolean;
  activated_at: number;
  expires_at: number;
  verified_locally?: boolean;
  token?: string;
  gateway?: string;
};

const REGION_KEY = "sg16/region";
const PASS_KEY = "sg16/pass";

// Region override set from Settings (mirrors the old store.get("region")).
export function getRegionOverride(): string {
  if (typeof window === "undefined") return "auto";
  try {
    return JSON.parse(localStorage.getItem(REGION_KEY) || `"auto"`) as string;
  } catch {
    return "auto";
  }
}

export function setRegionOverride(value: string): void {
  try {
    localStorage.setItem(REGION_KEY, JSON.stringify(value));
  } catch {
    /* storage unavailable — the app still works */
  }
}

// On-device region inference — exact port of the old detectRegion(): the
// device's own timezone/locale decides, nothing is probed externally.
export function detectRegion(): string | null {
  let tz = "";
  let lang = "";
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    lang = (navigator.language || "").toLowerCase();
  } catch {
    return null;
  }
  if (/gaza|hebron|ramallah|nablus|west.?bank|^asia\/jerusalem/i.test(tz)) return HUMANITARIAN_REGION;
  if (lang === "ar-ps" || lang.startsWith("ar-ps")) return HUMANITARIAN_REGION;
  return null;
}

export function resolveRegion(override?: string | null): string | null {
  if (override && override !== "auto") return override;
  return detectRegion();
}

export function loadPassRecord(): PassRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PASS_KEY);
    if (!raw) return null;
    const record = JSON.parse(raw) as PassRecord;
    const expiryMs =
      typeof record.expires_at === "number"
        ? record.expires_at * 1000
        : new Date(record.expires_at).getTime();
    if (expiryMs < Date.now()) return null; // expired
    return record;
  } catch {
    return null;
  }
}

export function storePassRecord(record: PassRecord): void {
  try {
    localStorage.setItem(PASS_KEY, JSON.stringify(record));
  } catch {
    /* storage unavailable */
  }
}

// Ultimate on-device issuance — exact mirror of the old localIssue()
// fallback used when the sovereign host itself is unreachable.
export function localIssue(passId: PassId, region: string | null): PassRecord {
  const spec = PASSES.find((p) => p.id === passId)!;
  const humanitarian = region === HUMANITARIAN_REGION;
  const now = Math.floor(Date.now() / 1000);
  return {
    pass: passId,
    provider: "guest",
    price_charged: humanitarian ? 0 : spec.price,
    list_price: spec.price,
    region,
    humanitarian_bypass: humanitarian,
    activated_at: now,
    expires_at: now + spec.hours * 3600,
    verified_locally: true,
    gateway: "local-device",
  };
}

export function passLabel(id: string): string {
  return PASSES.find((p) => p.id === id)?.label ?? id;
}

export function formatExpiry(expiresAt: number | string): string {
  const d =
    typeof expiresAt === "number" ? new Date(expiresAt * 1000) : new Date(expiresAt);
  return d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}
