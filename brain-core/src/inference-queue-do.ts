// Durable Object wrapper around InferenceGate — the Worker reaches it as
// QUEUE.idFromName("global"), so the single inference slot is shared by every
// project and user. The DO keeps no user content; only tickets and deadlines.

import { InferenceGate, DEFAULT_QUEUE_CONFIG } from "./inference-gate.ts";

interface DoEnv {
  // bindings for this DO class (none needed; state lives in the gate)
}

export class InferenceQueueDO {
  private gate = new InferenceGate(DEFAULT_QUEUE_CONFIG);

  constructor(_state: DurableObjectState, _env: DoEnv) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

    if (request.method === "POST" && path === "/acquire") {
      const { waitBudgetMs } = await request.json().catch(() => ({ waitBudgetMs: undefined })) as { waitBudgetMs?: number };
      return json(this.gate.acquire(waitBudgetMs));
    }
    if (request.method === "POST" && path === "/poll") {
      const { ticket } = await request.json().catch(() => ({ ticket: 0 })) as { ticket: number };
      return json(this.gate.poll(ticket));
    }
    if (request.method === "POST" && path === "/release") {
      const { ticket } = await request.json().catch(() => ({ ticket: 0 })) as { ticket: number };
      return json({ released: this.gate.release(ticket) });
    }
    if (request.method === "POST" && path === "/abandon") {
      const { ticket } = await request.json().catch(() => ({ ticket: 0 })) as { ticket: number };
      this.gate.abandon(ticket);
      return json({ abandoned: true });
    }
    if (request.method === "GET" && path === "/stats") {
      return json(this.gate.stats());
    }
    return json({ ok: false, code: "E_NOT_FOUND" }, 404);
  }
}
