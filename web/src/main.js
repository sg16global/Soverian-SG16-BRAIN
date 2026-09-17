// Sovereign SG16 Brain interface. Integrated 3D card tilt & real-time dashboard handlers.
import { api, getJson, delJson, fileToBase64 } from "./api.js";
import { renderMarkdown } from "./markdown.js";
import {
  sessionId,
  appendHistory,
  loadHistory,
  store,
} from "./storage.js";
import {
  PASSES,
  OWNER_EMAIL,
  resolveBilling,
  effectivePrice,
  startCheckout,
  confirmDodoReturn,
  ensureHumanitarianPass,
  persistPricingStatus,
  currentPass,
  attestIdentity,
  currentIdentity,
  generateApiKey,
  currentApiKey,
  hasFullSpeedBypass,
} from "./billing.js";

const $ = (id) => document.getElementById(id);
const els = {
  dot: $("dot"),
  status: $("chip-status"),
  designation: $("chip-designation"),
  transport: $("chip-transport"),
  core: $("chip-core"),
  gate: $("chip-gate"),
  transcript: $("transcript"),
  input: $("input"),
  composer: $("composer"),
  audio: $("audio"),
  audioName: $("audio-name"),
  reset: $("reset"),
  charter: $("charter"),
  jointRisk: $("joint-risk"),
  threshold: $("threshold"),
  verdict: $("verdict"),
  door: $("door"),
  planHead: $("plan-head"),
  planRoute: $("plan-route"),
  planTokens: $("plan-tokens"),
  planSha: $("plan-sha"),
  planSeal: $("plan-seal"),
  planSteps: $("plan-steps"),
  reasons: $("reasons"),
  parityCount: $("parity-count"),
  parityOk: $("parity-ok"),
  parityDigest: $("parity-digest"),
  regionLine: $("region-line"),
  buyApi: $("buy-api"),
  openPortal: $("open-portal"),
  goChat: $("go-chat"),
  portal: $("portal"),
  portalClose: $("portal-close"),
  portalKey: $("portal-key"),
  genKey: $("gen-key"),
  pricingNote: $("pricing-note"),
  humanitarian: $("humanitarian"),
  notice: $("notice"),
  noticeRef: $("notice-ref"),
  noticeSession: $("notice-session"),
  noticeWarnings: $("notice-warnings"),
  noticeReason: $("notice-reason"),
  noticeStatements: $("notice-statements"),
  noticeAck: $("notice-ack"),
  noticeDisclaimer: $("notice-disclaimer"),
  vipChip: $("vip-chip"),
};

const session = sessionId();
const PANEL_THROTTLE_MS = 800;
let lastSubmitAt = 0;

// ------------------------------------------------------------------
// 3D Perspective Card Motion Engine
// ------------------------------------------------------------------
function init3DTilt() {
  /* disabled — 3D perspective transforms soften panel edges */
}

// ------------------------------------------------------------------
// Message Rendering (Safe Markdown)
// ------------------------------------------------------------------
function addMessage(kind, tag, text, markdown = true) {
  const node = document.createElement("div");
  node.className = `msg ${kind}`;
  const label = document.createElement("span");
  label.className = "tag";
  label.textContent = tag;
  node.appendChild(label);
  const body = document.createElement("div");
  if (markdown) body.innerHTML = renderMarkdown(text);
  else body.textContent = text;
  node.appendChild(body);
  els.transcript.appendChild(node);
  els.transcript.scrollTop = els.transcript.scrollHeight;
  return node;
}

function setBar(member, risk) {
  const row = document.querySelector(`.gpt[data-member="${member}"]`);
  if (!row) return;
  const pct = Math.max(0, Math.min(1, risk)) * 100;
  row.querySelector(".bar i").style.width = `${pct.toFixed(1)}%`;
  row.querySelector(".gpt-val").textContent = risk.toFixed(3);
  row.classList.toggle("hot", risk >= 0.4 && risk < 0.62);
  row.classList.toggle("crit", risk >= 0.62);
}

function flashDoor(allowed) {
  els.door.classList.remove("pass", "block");
  void els.door.offsetWidth;
  els.door.classList.add(allowed ? "pass" : "block");
  setTimeout(() => els.door.classList.remove("pass", "block"), 900);
}

function renderVerdict(tx) {
  const v = tx.verdict;
  for (const member of v.members) setBar(member.member, member.risk);
  els.jointRisk.textContent = v.joint_risk.toFixed(4);
  els.threshold.textContent = v.threshold.toFixed(4);
  els.verdict.textContent = v.allowed ? "passed the gate" : "thrown back";
  els.verdict.style.color = v.allowed ? "var(--neon-green)" : "var(--crimson-2)";
  flashDoor(v.allowed);
  els.reasons.innerHTML = "";
  for (const reason of (v.reasons || []).slice(0, 8)) {
    const li = document.createElement("li");
    li.textContent = reason;
    els.reasons.appendChild(li);
  }
}

function renderPlan(tx) {
  els.planSeal.textContent = tx.seal ? tx.seal.slice(-20) : "—";
  const plan = tx.plan;
  els.planSteps.innerHTML = "";
  if (!plan) {
    els.planHead.textContent = "not executed";
    els.planRoute.textContent = "rejected at the gate";
    els.planTokens.textContent = "—";
    els.planSha.textContent = "—";
    const li = document.createElement("li");
    li.textContent = "the core never runs for a rejected payload";
    els.planSteps.appendChild(li);
    return;
  }
  els.planHead.textContent = plan.head;
  els.planRoute.textContent = plan.route;
  els.planTokens.textContent = `${plan.token_count} / ${plan.chunk_count}`;
  els.planSha.textContent = plan.plan_sha256.slice(0, 24);
  for (const step of plan.steps) {
    const li = document.createElement("li");
    li.textContent = step;
    els.planSteps.appendChild(li);
  }
}

function showNotice(notice) {
  els.noticeRef.textContent = notice.reference;
  els.noticeSession.textContent = notice.session_id;
  els.noticeWarnings.textContent = String(notice.warnings_issued);
  els.noticeReason.textContent = notice.reason;
  els.noticeStatements.innerHTML = "";
  for (const s of notice.statements) {
    const li = document.createElement("li");
    li.textContent = s;
    els.noticeStatements.appendChild(li);
  }
  els.noticeDisclaimer.textContent = notice.disclaimer;
  els.notice.hidden = false;
  els.noticeAck.focus();
}

// ------------------------------------------------------------------
// Billing UI
// ------------------------------------------------------------------
function refreshPricing() {
  const billing = resolveBilling();
  persistPricingStatus(billing);
  const vip = hasFullSpeedBypass();
  if (els.vipChip) els.vipChip.hidden = !vip;
  els.regionLine.textContent =
    `region: ${billing.region || "auto"}` +
    (vip ? " · VIP OWNER · full-speed bypass" : billing.humanitarian ? " · FREE (humanitarian)" : "");
  document.querySelectorAll(".pass").forEach((card) => {
    const id = card.dataset.pass;
    const price = effectivePrice(id, billing);
    const priceEl = card.querySelector(".price");
    priceEl.innerHTML = `$${price}<span>${PASSES[id].unit}</span>`;
    card.classList.toggle("free", billing.humanitarian || vip);
  });
  const pass = currentPass();
  els.pricingNote.textContent = vip
    ? "VIP owner recognized (sg16global@gmail.com): continuous full-speed throttle bypass active across the 3-GPT panel."
    : pass
      ? `Active pass: ${PASSES[pass.pass]?.label || pass.pass} · $${pass.price_charged} · expires ${pass.expires_at} · verified locally.`
      : "Localized verification runs entirely on your device. Your credentials and history never leave it.";
}

async function handleBuy(passId) {
  const billing = resolveBilling();
  let identity = currentIdentity();
  if (!identity) {
    const provider = window.confirm("Continue with Google? (Cancel for Apple)")
      ? "Google"
      : "Apple";
    identity = await attestIdentity(provider);
  }
  const result = await startCheckout(passId, identity);
  refreshPricing();

  if (result.mode === "dodo" && result.checkout_url) {
    addMessage(
      "audio-note",
      "dodo payments · secure mor checkout",
      `Opening the Dodo Payments Merchant-of-Record checkout for the ${PASSES[passId].label}. ` +
        `The moment payment confirms, the signed, duration-locked pass token is committed ` +
        `to your local sg16/ folder - it never leaves your device.`,
      false
    );
    setTimeout(() => {
      window.location.href = result.checkout_url;
    }, 600);
    return;
  }

  const record = result.record;
  addMessage(
    "audio-note",
    "local subscription",
    `${PASSES[record.pass].label} activated on-device for $${record.price_charged}` +
      (record.humanitarian_bypass ? " (humanitarian zero-rate bypass — gateway skipped)" : "") +
      (record.vip_owner_bypass ? " (VIP owner bypass)" : "") +
      `. History stays in your local folder; the core grid keeps 0 client logs.`
  );
}

// ------------------------------------------------------------------
// Data Ingest Dispatcher
// ------------------------------------------------------------------
async function submit(text, audioB64) {
  if (!hasFullSpeedBypass()) {
    const wait = PANEL_THROTTLE_MS - (Date.now() - lastSubmitAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastSubmitAt = Date.now();

  addMessage("user", `you · ${session}`, text || "[audio attached]", false);
  const payload = { text, session_id: session };
  if (hasFullSpeedBypass()) payload.vip_owner = true;
  if (audioB64) payload.audio_b64 = audioB64;

  const headers = { "Content-Type": "application/json" };
  const identity = currentIdentity();
  if (identity && identity.email === OWNER_EMAIL) headers["X-SG16-Owner"] = identity.email;
  const pass = store.get("pass");
  if (pass && pass.token) headers["X-SG16-Pass"] = pass.token;

  const tx = await api("/api/ingest", { method: "POST", headers, body: JSON.stringify(payload) });

  let kind = "brain";
  if (tx.stage === "refused") kind = "refused";
  else if (tx.stage === "warning" || tx.stage === "notice_issued") kind = "warning";
  else if (tx.stage === "neutral") kind = "neutral";

  addMessage(kind, `sg16 · ${tx.stage}`, tx.reply);
  if (tx.audio) {
    addMessage(
      "audio-note",
      "sg16 brain · measured acoustics",
      `${tx.audio.classification} · ${tx.audio.duration_ms} ms @ ${tx.audio.sample_rate} Hz · rms ${tx.audio.rms} · zcr ${tx.audio.zero_crossing_rate} · transcript ${tx.audio.transcript_source}`,
      false
    );
  }
  if (tx.notice) showNotice(tx.notice);

  renderVerdict(tx);
  renderPlan(tx);

  appendHistory(session, { role: "user", text });
  appendHistory(session, { role: "brain", stage: tx.stage, text: tx.reply });
}

// ------------------------------------------------------------------
// System Initialization
// ------------------------------------------------------------------
async function boot() {
  try {
    const [health, identity, charter, parity] = await Promise.all([
      getJson("/api/health"),
      getJson("/api/identity"),
      getJson("/api/charter"),
      getJson("/api/parity"),
    ]);
    els.dot.classList.add("live");
    els.status.textContent = "ready";
    if (els.designation) {
      els.designation.textContent = identity.verified
        ? identity.designation
        : "UNVERIFIED";
      els.designation.title = identity.official_name;
    }
    els.transport.textContent = health.transport;
    if (els.core) els.core.textContent = "SG16-BRAIN";
    els.gate.textContent = health.gate_weights_sha256.slice(0, 10);

    els.charter.innerHTML = "";
    charter.invariants.forEach((inv, i) => {
      const li = document.createElement("li");
      const b = document.createElement("b");
      b.textContent = `${i + 1}. ${inv.key.replace(/_/g, " ")}`;
      const span = document.createElement("span");
      span.textContent = inv.text;
      li.append(b, span);
      els.charter.appendChild(li);
    });

    els.parityCount.textContent = String(parity.payloads);
    els.parityOk.textContent = parity.identical ? "yes" : "NO";
    els.parityOk.style.color = parity.identical ? "var(--neon-green)" : "var(--crimson-2)";
    els.parityDigest.textContent = parity.online_digest.slice(0, 20);

    const history = loadHistory(session);
    if (history.length) {
      for (const entry of history) {
        addMessage(
          entry.role === "user" ? "user" : "brain",
          entry.role === "user" ? `you · ${session}` : `sg16 · ${entry.stage || ""}`,
          entry.text,
          entry.role !== "user"
        );
      }
    } else {
      addMessage("brain", "sg16 brain", "Share your idea first.");
    }
  } catch (error) {
    els.dot.classList.add("down");
    els.status.textContent = "unreachable";
    addMessage("brain", "host error", String(error.message || error), false);
  }

  // Returning from a Dodo checkout: pick up the signed record if the webhook
  // has confirmed, and commit it to the local folder.
  try {
    const confirmed = await confirmDodoReturn();
    if (confirmed && confirmed.pass) {
      addMessage(
        "audio-note",
        "dodo payments · confirmed",
        `${PASSES[confirmed.pass]?.label || confirmed.pass} confirmed and signed into ` +
          `your local folder. Valid until ${new Date(confirmed.expires_at * 1000).toLocaleString()}.`,
        false
      );
    }
  } catch {}

  // Palestine interceptor: humanitarian devices get their $0 token on boot.
  try {
    await ensureHumanitarianPass();
  } catch {}

  refreshPricing();
  init3DTilt();
}

// ------------------------------------------------------------------
// Event Binding
// ------------------------------------------------------------------
els.composer.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = els.input.value.trim();
  const file = els.audio.files && els.audio.files[0];
  if (!text && !file) return;
  els.input.value = "";
  try {
    let audioB64 = null;
    if (file) {
      audioB64 = await fileToBase64(file);
      els.audio.value = "";
      els.audioName.textContent = "";
    }
    await submit(text, audioB64);
  } catch (error) {
    addMessage("brain", "host error", String(error.message || error), false);
  }
});

els.input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    els.composer.requestSubmit();
  }
});

els.audio.addEventListener("change", () => {
  const file = els.audio.files && els.audio.files[0];
  els.audioName.textContent = file
    ? `${file.name} · ${(file.size / 1024).toFixed(1)} KB`
    : "";
});

els.reset.addEventListener("click", async () => {
  await delJson(`/api/session/${encodeURIComponent(session)}`).catch(() => {});
  store.del(`history/${session}`);
  els.transcript.innerHTML = "";
  addMessage("brain", "sg16 brain", "Session forgotten. Share your idea first.");
});

document.querySelectorAll("[data-buy]").forEach((btn) => {
  btn.addEventListener("click", () => handleBuy(btn.dataset.buy));
});

els.buyApi.addEventListener("click", () => {
  document.getElementById("pricing").scrollIntoView({ behavior: "smooth" });
});
els.goChat.addEventListener("click", () => {
  document.getElementById("go-chat-target").scrollIntoView({ behavior: "smooth" });
});

els.openPortal.addEventListener("click", () => {
  els.portal.hidden = false;
  const key = currentApiKey();
  els.portalKey.textContent = key ? `key: ${key}` : "key: (not generated yet)";
});
els.portalClose.addEventListener("click", () => (els.portal.hidden = true));
els.genKey.addEventListener("click", async () => {
  const key = await generateApiKey();
  els.portalKey.textContent = `key: ${key}`;
});

els.noticeAck.addEventListener("click", () => (els.notice.hidden = true));

const MATRIX_CANDIDATES = [
  "dashboard-matrix.jpg",
  "dashboard-matrix.png",
  "IMG_2765.PNG",
];

function mountDashboardMatrix() {
  const img = document.getElementById("dashboard-matrix");
  if (!img) return;

  const activate = () => {
    img.hidden = false;
    document.body.classList.add("has-matrix");
    const hero = document.getElementById("hero-fallback");
    if (hero) hero.prepend(hero.querySelector(".hero-actions"));
    document.querySelector(".dashboard-canvas")?.prepend(hero);
  };

  const tryNext = (index) => {
    if (index >= MATRIX_CANDIDATES.length) return;
    const name = MATRIX_CANDIDATES[index];
    fetch("/assets/" + name, { method: "HEAD" })
      .then((probe) => {
        if (!probe || !probe.ok) return tryNext(index + 1);
        img.src = "/assets/" + name;
        img.addEventListener("load", activate, { once: true });
        if (img.complete) activate();
      })
      .catch(() => tryNext(index + 1));
  };

  if (img.complete && img.naturalWidth > 0) {
    activate();
    return;
  }
  tryNext(0);
}

function wireAssetFallbacks() {
  const heroEl = document.querySelector(".hero-section");
  if (heroEl) {
    heroEl.style.backgroundImage = 'url("/assets/IMG_2764.JPEG")';
    heroEl.style.backgroundSize = "82% auto";
    heroEl.style.backgroundPosition = "center 24%";
    heroEl.style.backgroundRepeat = "no-repeat";
  }
  mountDashboardMatrix();
}

wireAssetFallbacks();
boot();
