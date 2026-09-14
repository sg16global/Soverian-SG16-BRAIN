// Localized device storage directory.
//
// Everything the brain persists for a user lives ONLY on the user's device,
// namespaced under "sg16/".  The sovereign host keeps no client logs: it holds
// an in-memory session for the duration of a conversation and persists nothing.
// In a packaged desktop/mobile build this namespace maps 1:1 onto an isolated
// application directory on disk; in the browser it maps onto localStorage, and
// the user can export the whole folder as a file at any time.

const NS = "sg16";

export const store = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(`${NS}/${key}`);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`${NS}/${key}`, JSON.stringify(value));
    } catch {
      /* storage may be unavailable (private mode); the app still works */
    }
  },
  del(key) {
    try {
      localStorage.removeItem(`${NS}/${key}`);
    } catch {}
  },
};

export function sessionId() {
  let id = store.get("session");
  if (!id) {
    id = "guest-" + Math.random().toString(36).slice(2, 10);
    store.set("session", id);
  }
  return id;
}

export function appendHistory(session, entry) {
  const history = store.get(`history/${session}`, []);
  history.push(entry);
  store.set(`history/${session}`, history);
  return history;
}

export function loadHistory(session) {
  return store.get(`history/${session}`, []);
}

// Export the local folder as a single JSON file - the user's own copy.
export function exportLocalFolder(session) {
  const folder = {
    generated: new Date().toISOString(),
    device: "local-only",
    session,
    history: loadHistory(session),
    pass: store.get("pass"),
    identity: store.get("identity"),
    region: store.get("region"),
  };
  const blob = new Blob([JSON.stringify(folder, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sg16-brain-${session}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}
