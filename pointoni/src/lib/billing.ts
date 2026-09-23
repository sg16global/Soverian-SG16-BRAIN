// Client-visible pass descriptions. Authorization and prices are decided by
// the SG16 host; these constants are display metadata only.
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
  { id: "day", label: "24-Hour Entry", price: 3, unit: "/day", hours: 24, blurb: "A time-limited host entitlement; service limits still apply.", accent: "#39d7ff" },
  { id: "week", label: "1-Week Premium", price: 5, unit: "/week", hours: 24 * 7, blurb: "A time-limited host entitlement; service limits still apply.", accent: "#b06bff" },
  { id: "half", label: "15-Day Premium", price: 8, unit: "/15 days", hours: 24 * 15, blurb: "A time-limited host entitlement; service limits still apply.", accent: "#22e08c", featured: true },
  { id: "month", label: "1-Month Premium", price: 15, unit: "/month", hours: 24 * 30, blurb: "A time-limited host entitlement; service limits still apply.", accent: "#ffd166" },
] as const;

export const HUMANITARIAN_REGION = "Palestine";

export const BILLING_COPY = {
  deckTitle: "Host-verified access passes",
  localizedNote: "The host decides eligibility and validates payment; this browser cannot assert a region or issue a pass.",
  humanitarianNote: "Any regional zero-rate eligibility must be verified by an operator-trusted proxy. Browser locale and region overrides do not qualify.",
  noPassNote: "No pass is stored in this browser. Standard requests remain subject to the configured host limits.",
  gatewayNote: "Paid checkout is available only when the operator has configured Dodo Payments. A pass token is a bearer credential; the host currently keeps verification state in process memory, so deployment restarts can affect pass validation.",
  regionDetectNote: "Location is not inferred or overridden in this browser. Regional eligibility, if configured, is determined by the host from trusted proxy assertions.",
} as const;

export type PassRecord = {
  pass: PassId;
  provider?: string;
  price_charged: number;
  list_price?: number;
  region: string | null;
  humanitarian_bypass?: boolean;
  activated_at: number;
  expires_at: number;
  nonce?: string;
  token?: string;
  gateway?: string;
  verified_by?: string;
};

const PASS_KEY = "sg16/pass";

export function loadPassRecord(): PassRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PASS_KEY);
    if (!raw) return null;
    const record = JSON.parse(raw) as PassRecord;
    if (
      !PASSES.some((pass) => pass.id === record.pass) ||
      typeof record.token !== "string" || !/^[a-f0-9]{64}$/.test(record.token) ||
      typeof record.expires_at !== "number" || record.expires_at <= Date.now() / 1000
    ) return null;
    return record;
  } catch {
    return null;
  }
}

export function storePassRecord(record: PassRecord): void {
  try {
    localStorage.setItem(PASS_KEY, JSON.stringify(record));
  } catch {
    // Storage may be disabled; checkout still occurs on the host.
  }
}

export function passLabel(id: string): string {
  return PASSES.find((pass) => pass.id === id)?.label ?? id;
}

export function formatExpiry(expiresAt: number | string): string {
  const date = typeof expiresAt === "number" ? new Date(expiresAt * 1000) : new Date(expiresAt);
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}
