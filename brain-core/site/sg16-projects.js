// SG16 — "Connected projects" box on /admin (owner request 2026-10-19).
//
// Operator-only: lists every project key with its live API status, last
// call, 24h calls, errors and average answer time, from
// GET /api/admin/project-activity (read-only; nothing new is stored). The box
// is placed right after the admin console's "Connected models" panel and put
// back by a MutationObserver whenever React renders the page again. It
// refreshes every 30 s while the page is visible. Visitors never see it:
// the script does nothing outside /admin, and the endpoint answers only the
// signed-in operator.
(function () {
  "use strict";
  var ID = "sg16-projects";
  var REFRESH_MS = 30000;

  var CSS =
    "#sg16-projects .p-wrap{margin-top:16px;overflow-x:auto}" +
    "#sg16-projects table{width:100%;border-collapse:collapse;min-width:640px}" +
    "#sg16-projects th{text-align:left;padding:8px 10px;font-size:10px;letter-spacing:.14em;color:#8aa0bd;font-weight:600;border-bottom:1px solid rgba(255,255,255,.1);white-space:nowrap}" +
    "#sg16-projects td{padding:10px;font-size:11px;color:#e2e8f0;border-bottom:1px solid rgba(255,255,255,.06);white-space:nowrap}" +
    "#sg16-projects tr:last-child td{border-bottom:0}" +
    "#sg16-projects .p-name{font-weight:800;letter-spacing:.08em;color:#fff}" +
    "#sg16-projects .p-key{color:#94a3b8}" +
    "#sg16-projects .p-num{text-align:right}" +
    "#sg16-projects .p-err{color:#ff8a3d}" +
    "#sg16-projects .p-status{display:inline-flex;align-items:center;gap:6px;font-size:10px;font-weight:600;letter-spacing:.14em}" +
    "#sg16-projects .p-note{margin-top:12px;font-size:10px;letter-spacing:.12em;color:#64748b}" +
    "#sg16-projects .p-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}" +
    "#sg16-projects .p-refresh{font-size:10px;letter-spacing:.14em;color:#64748b}";

  var STATUS = {
    live: { color: "#22e08c", text: "LIVE" },
    active: { color: "#ffb020", text: "ACTIVE" },
    idle: { color: "#8aa0bd", text: "IDLE" },
    never: { color: "#8aa0bd", text: "NEVER USED" },
    blocked: { color: "#ff3b4c", text: "BLOCKED" },
  };

  var data = null;      // last good response
  var errorText = "";   // shown when a refresh fails
  var denied = false;   // not an operator: show nothing
  var timer = null;

  function onAdmin() {
    return /^\/admin\/?$/.test(location.pathname);
  }

  function token() {
    try {
      var raw = localStorage.getItem("sg16/identity");
      var parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed.token === "string" ? parsed.token : "";
    } catch (e) {
      return "";
    }
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function ago(ts, now) {
    if (!ts) return "—";
    var s = Math.max(0, Math.round((now - ts) / 1000));
    if (s < 60) return s + " sec ago";
    var m = Math.round(s / 60);
    if (m < 60) return m + " min ago";
    var h = Math.round(m / 60);
    if (h < 48) return h + " h ago";
    return Math.round(h / 24) + " days ago";
  }

  function speed(ms) {
    return ms === null || ms === undefined ? "—" : (ms / 1000).toFixed(1) + " s";
  }

  function addStyle() {
    if (document.getElementById("sg16-projects-style")) return;
    var st = document.createElement("style");
    st.id = "sg16-projects-style";
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function render(box) {
    var list = data ? data.projects : [];
    var now = data ? data.now : Date.now();
    var head =
      '<div class="p-head">' +
      '<h3 class="flex items-center gap-2 font-display text-[13px] font-black tracking-widest text-white">' +
      '<svg class="h-4 w-4 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>' +
      " CONNECTED PROJECTS · " + list.length + "</h3>" +
      '<span class="p-refresh font-mono2">AUTO-REFRESH 30S</span></div>';
    var body;
    if (!data && !errorText) {
      body = '<p class="p-note font-mono2">LOADING…</p>';
    } else if (list.length === 0) {
      body = '<p class="p-note font-mono2">NO PROJECT KEYS YET — CREATE ONE IN PROJECT KEYS ABOVE.</p>';
    } else {
      var rows = "";
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        var st = STATUS[p.status] || STATUS.idle;
        rows +=
          "<tr>" +
          '<td class="p-name font-display">' + esc(p.project.toUpperCase()) + "</td>" +
          '<td class="p-key font-mono2">…' + esc(p.last12) + "</td>" +
          '<td><span class="p-status font-mono2" style="color:' + st.color + '">' +
          '<span class="status-dot" style="background:' + st.color + ";color:" + st.color + '"></span>' + st.text + "</span></td>" +
          '<td class="font-mono2">' + ago(p.lastCall, now) + "</td>" +
          '<td class="p-num font-mono2">' + p.calls24h + "</td>" +
          '<td class="p-num font-mono2' + (p.errors24h > 0 ? " p-err" : "") + '">' + p.errors24h + "</td>" +
          '<td class="p-num font-mono2">' + speed(p.avgMs24h) + "</td>" +
          "</tr>";
      }
      body =
        '<div class="p-wrap"><table class="font-mono2"><thead><tr>' +
        "<th>PROJECT</th><th>KEY (LAST 12)</th><th>STATUS</th><th>LAST CALL</th>" +
        '<th class="p-num">24H CALLS</th><th class="p-num">ERRORS</th><th class="p-num">SPEED</th>' +
        "</tr></thead><tbody>" + rows + "</tbody></table></div>" +
        '<p class="p-note font-mono2">LIVE = CALLED IN THE LAST 5 MIN · ACTIVE = LAST 24 H · SPEED = AVERAGE ANSWER TIME, 24 H</p>';
    }
    if (errorText) body += '<p class="p-note font-mono2 p-err">' + esc(errorText) + "</p>";
    box.innerHTML = head + body;
  }

  function load() {
    var box = document.getElementById(ID);
    if (!box || !onAdmin() || document.hidden) return;
    var t = token();
    if (!t) return;
    fetch("/api/admin/project-activity", { headers: { authorization: "Bearer " + t }, cache: "no-store" })
      .then(function (r) {
        if (r.status === 401 || r.status === 403) {
          denied = true;
          var b = document.getElementById(ID);
          if (b) b.remove();
          return null;
        }
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (json) {
        if (!json) return;
        data = json;
        errorText = "";
        var b = document.getElementById(ID);
        if (b) render(b);
      })
      .catch(function () {
        errorText = "COULD NOT REFRESH — SHOWING THE LAST DATA.";
        var b = document.getElementById(ID);
        if (b) render(b);
      });
  }

  // the admin console's "CONNECTED MODELS" panel
  function anchor() {
    var heads = document.querySelectorAll("section.panel h3");
    for (var i = 0; i < heads.length; i++) {
      if (heads[i].textContent.indexOf("CONNECTED MODELS") !== -1) return heads[i].closest("section.panel");
    }
    return null;
  }

  function place() {
    if (!onAdmin() || denied || !token()) return;
    var a = anchor();
    if (!a) return;
    var box = document.getElementById(ID);
    if (box && box.previousElementSibling === a) return;
    addStyle();
    if (!box) {
      box = document.createElement("section");
      box.id = ID;
      box.className = "panel corner p-5";
      box.setAttribute("aria-label", "Connected projects");
      render(box);
    }
    a.after(box);
    if (!data) load();
    if (!timer) timer = setInterval(load, REFRESH_MS);
  }

  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () {
      queued = false;
      place();
    });
  }

  function start() {
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) load();
    });
    place();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
