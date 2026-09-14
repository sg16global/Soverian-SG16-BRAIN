// Sovereign SG16 Brain interface. No frameworks, no CDN, no external assets.
import { getJson, postJson, delJson, fileToBase64 } from "./api.js";
import { renderMarkdown } from "./markdown.js";
import {
  sessionId,
  appendHistory,
  loadHistory,
  exportLocalFolder,
  store,
} from "./storage.js";
import {
  PASSES,
  resolveBilling,
  effectivePrice,
  subscribe,
  currentPass,
  attestIdentity,
  currentIdentity,
  generateApiKey,
  currentApiKey,
} from "./billing.js";

const $ = (id) => document.getElementById(id);
const els = {
  dot: $("dot"),
  status: $("chip-status"),
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
};

const session = sessionId();

// ------------------------------------------------------------------
// message rendering (markdown, safe)
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
  els.verdict.style.color = v.allowed ? "var(--green)" : "var(--crimson-2)";
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
// billing UI
// ------------------------------------------------------------------
function refreshPricing() {
  const billing = resolveBilling();
  els.regionLine.textContent = `region: ${billing.region || "auto"}${billing.humanitarian ? " · FREE (humanitarian)" : ""}`;
  document.querySelectorAll(".pass").forEach((card) => {
    const id = card.dataset.pass;
    const price = effectivePrice(id, billing);
    const priceEl = card.querySelector(".price");
    priceEl.innerHTML = `$${price}<span>${PASSES[id].unit}</span>`;
    card.classList.toggle("free", billing.humanitarian);
  });
  const pass = currentPass();
  els.pricingNote.textContent = pass
    ? `Active pass: ${PASSES[pass.pass].label} · $${pass.price_charged} · expires ${pass.expires_at} · verified locally.`
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
  const record = subscribe(passId, identity);
  refreshPricing();
  addMessage(
    "audio-note",
    "local subscription",
    `${PASSES[record.pass].label} activated on-device for $${record.price_charged}` +
      (record.humanitarian_bypass ? " (humanitarian zero-rate bypass)" : "") +
      `. History stays in your local folder; the core grid keeps 0 client logs.`
  );
}

// ------------------------------------------------------------------
// send
// ------------------------------------------------------------------
async function submit(text, audioB64) {
  addMessage("user", `you · ${session}`, text || "[audio attached]", false);
  const payload = { text, session_id: session };
  if (audioB64) payload.audio_b64 = audioB64;
  const tx = await postJson("/api/ingest", payload);

  let kind = "brain";
  if (tx.stage === "refused") kind = "refused";
  else if (tx.stage === "warning" || tx.stage === "notice_issued") kind = "warning";
  else if (tx.stage === "neutral") kind = "neutral";

  addMessage(kind, `sg16 · ${tx.stage}`, tx.reply);
  if (tx.audio) {
    addMessage(
      "audio-note",
      "voxtral · measured acoustics",
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
// boot
// ------------------------------------------------------------------
async function boot() {
  try {
    const [health, charter, parity] = await Promise.all([
      getJson("/api/health"),
      getJson("/api/charter"),
      getJson("/api/parity"),
    ]);
    els.dot.classList.add("live");
    els.status.textContent = "ready";
    els.transport.textContent = health.transport;
    els.core.textContent = health.core;
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
    els.parityOk.style.color = parity.identical ? "var(--green)" : "var(--crimson-2)";
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
  refreshPricing();
}

// ------------------------------------------------------------------
// wiring
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

boot();
