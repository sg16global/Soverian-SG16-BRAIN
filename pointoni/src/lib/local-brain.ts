// ===================================================================
// FRIEND ENGINE — the brain running on the USER'S OWN DEVICE.
//
// Doctrine v2, roadmap step 1: weights are downloaded ONCE per device (browser
// cache), then every chat turn is generated locally via WebGPU (WASM fallback).
// Per-message network requests during chat: ZERO. The user's home, energy and
// battery do the work — ours never does.
// ===================================================================

export type FriendWeight = {
  id: string;
  label: string;
  modelId: string; // transformers.js hub id
  params: string; //  human-readable parameter count
  download: string; // approx footprint on first fetch
  minRam: number; //    GB deviceMemory heuristic gate
  blurb: string;
};

// device-fitted classes — poorest phone first, exactly the doctrine.
export const FRIEND_WEIGHTS: FriendWeight[] = [
  {
    id: "friend-s",
    label: "FRIEND · S",
    modelId: "HuggingFaceTB/SmolLM2-135M-Instruct",
    params: "135M",
    download: "~95 MB",
    minRam: 2,
    blurb: "Cheapest phone in the world gets the same friend. Fast, light, honest.",
  },
  {
    id: "friend-m",
    label: "FRIEND · M",
    modelId: "HuggingFaceTB/SmolLM2-360M-Instruct",
    params: "360M",
    download: "~210 MB",
    minRam: 4,
    blurb: "Deeper everyday presence for mid-range phones and laptops.",
  },
];

export type DeviceProbe = {
  webgpu: boolean;
  wasm: boolean;
  deviceMemoryGb: number | null;
  cores: number;
  online: boolean;
};

export async function probeDevice(): Promise<DeviceProbe> {
  return {
    webgpu:
      typeof navigator !== "undefined" &&
      "gpu" in navigator &&
      !!(await (navigator as Navigator & { gpu?: { requestAdapter?: () => Promise<unknown> } }).gpu
        ?.requestAdapter?.()
        .catch(() => null)),
    wasm: typeof WebAssembly !== "undefined",
    deviceMemoryGb:
      typeof navigator !== "undefined" && "deviceMemory" in navigator
        ? ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null)
        : null,
    cores: typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 0 : 0,
    online: typeof navigator !== "undefined" ? navigator.onLine : true,
  };
}

export function recommendWeight(probe: DeviceProbe): FriendWeight {
  const ram = probe.deviceMemoryGb ?? 2;
  return ram >= FRIEND_WEIGHTS[1].minRam ? FRIEND_WEIGHTS[1] : FRIEND_WEIGHTS[0];
}

// -------------------------------------------------------------------
// engine — lazy dynamic import so the platform bundle never touches onnx
// -------------------------------------------------------------------

type ChatMsg = { role: "user" | "assistant" | "system"; content: string };
type PipelineFn = (
  convo: ChatMsg[],
  opts: Record<string, unknown>,
) => Promise<{ generated_text: string | ChatMsg[] } | { generated_text: string | ChatMsg[] }[]>;

export type FriendEngine = {
  chat: (history: ChatMsg[], user: string) => Promise<{ reply: string; ms: number }>;
  dispose: () => Promise<void>;
};

export async function loadFriendEngine(
  weight: FriendWeight,
  onProgress?: (progress: { file: string; loaded: number; total: number; fraction: number }) => void,
): Promise<FriendEngine> {
  const probe = await probeDevice();
  const device = probe.webgpu ? "webgpu" : "wasm";

  const { env, pipeline } = await import("@huggingface/transformers");
  // browser cache is the permanent home for weights on this device
  env.useBrowserCache = true;
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  // serve the ONNX runtime from OUR OWN static path — no third-party CDN,
  // doctrine v2: self-hosted atoms all the way down
  (env as unknown as { backends?: { onnx?: { wasm?: { wasmPaths: string } } } }).backends!.onnx!.wasm!.wasmPaths =
    "/onnx/";

  let progressTimer: ReturnType<typeof setInterval> | null = null;
  let progressData = new Map<string, { loaded: number; total: number }>();
  let latestFile = "";
  if (onProgress) {
    progressTimer = setInterval(() => {
      let loaded = 0, total = 0;
      for (const p of progressData.values()) { loaded += p.loaded; total += p.total; }
      onProgress({ file: latestFile, loaded, total, fraction: total ? loaded / total : 0 });
    }, 120);
  }

  const progress_callback = (info: unknown) => {
    const i = info as { status?: string; file?: string; loaded?: number; total?: number };
    if (i.status === "progress" && i.file) {
      latestFile = i.file;
      progressData.set(i.file, { loaded: i.loaded ?? 0, total: i.total ?? 0 });
    }
  };

  let pipe: PipelineFn;
  try {
    pipe = (await pipeline("text-generation", weight.modelId, {
      device,
      dtype: "q4",
      progress_callback,
    })) as unknown as PipelineFn;
  } catch (err) {
    if (progressTimer) clearInterval(progressTimer);
    throw new Error(
      `Engine load failed (${device}). ${err instanceof Error ? err.message : "device may lack WebGPU/WebAssembly or network access."}`,
    );
  } finally {
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
      progressData = new Map();
    }
  }

  const SYSTEM: ChatMsg = {
    role: "system",
    content:
      "You are SG16 FRIEND — the sovereign brain's on-device presence. Warm, concise, honest. Answer briefly and helpfully.",
  };

  return {
    async chat(history, user) {
      const t0 = performance.now();
      const convo: ChatMsg[] = [SYSTEM, ...history.slice(-8), { role: "user", content: user }];
      const out = await pipe(convo, {
        max_new_tokens: 220,
        do_sample: true,
        temperature: 0.7,
        repetition_penalty: 1.15,
      });
      const first = Array.isArray(out) ? out[0] : out;
      let reply = "";
      if (typeof first?.generated_text === "string") {
        // string form: strip the prompt echo
        reply = first.generated_text.slice(first.generated_text.lastIndexOf(user) + user.length);
      } else if (Array.isArray(first?.generated_text)) {
        const last = first.generated_text[first.generated_text.length - 1];
        reply = last?.content ?? "";
      }
      return { reply: reply.trim() || "(the friend is thinking silently — rephrase it)", ms: Math.round(performance.now() - t0) };
    },
    async dispose() {
      try {
        const p = pipe as unknown as { dispose?: () => Promise<void> };
        await p.dispose?.();
      } catch { /* webgpu teardown best-effort */ }
    },
  };
}
