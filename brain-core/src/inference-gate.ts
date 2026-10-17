// The inference queue — one Durable Object, one semaphore.
//
// Exactly one inference runs on the VPS at a time; everything else waits in
// a FIFO queue with a per-request deadline. A crashed caller cannot deadlock
// the slot: every grant carries a lease, and an expired lease is reclaimed
// by the next acquire. Deterministic, testable, no third-party services.

export interface QueueConfig {
  waitBudgetMs: number;   // per-request max time from enqueue to grant
  leaseMs: number;         // a grant older than this is treated as abandoned
}

export const DEFAULT_QUEUE_CONFIG: QueueConfig = { waitBudgetMs: 45000, leaseMs: 90000 };

interface Waiting {
  id: number;
  deadline: number;
}

export class InferenceGate {
  private busy = false;
  private leaseHolder: number | null = null;
  private leaseAt = 0;
  private queue: Waiting[] = [];
  private nextId = 1;
  private readonly config: QueueConfig;
  private now: () => number;

  constructor(config: QueueConfig = DEFAULT_QUEUE_CONFIG, now: () => number = () => Date.now()) {
    this.config = config;
    this.now = now;
  }

  /** Try to take the single inference slot. Returns the ticket, or the queue
   * position and the wait budget for this request. */
  acquire(waitBudgetMs?: number): { granted: true; ticket: number } | { granted: false; ticket: number; position: number; deadline: number } {
    const now = this.now();
    if (this.busy && now - this.leaseAt > this.config.leaseMs) {
      this.busy = false; // lease expired: reclaim the abandoned slot
      this.leaseHolder = null;
    }
    const ticket = this.nextId++;
    if (!this.busy) {
      this.busy = true;
      this.leaseHolder = ticket;
      this.leaseAt = now;
      return { granted: true, ticket };
    }
    const deadline = now + (waitBudgetMs ?? this.config.waitBudgetMs);
    this.queue.push({ id: ticket, deadline });
    const position = this.queue.length;
    return { granted: false, ticket, position, deadline };
  }

  /** Re-check a waiting ticket. Drops tickets whose deadline passed. */
  poll(ticket: number): { granted: true } | { granted: false; position: number; expired: boolean } {
    const now = this.now();
    if (this.busy && now - this.leaseAt > this.config.leaseMs) {
      this.busy = false;
      this.leaseHolder = null;
    }
    this.dropExpired(now);
    if (!this.busy) {
      const next = this.queue.shift();
      if (next && next.id === ticket) {
        this.busy = true;
        this.leaseHolder = ticket;
        this.leaseAt = now;
        return { granted: true };
      }
      if (next) this.queue.unshift(next); // not this ticket's turn; put the head back
    }
    const position = this.queue.findIndex((w) => w.id === ticket);
    if (position === -1) return { granted: false, position: -1, expired: true };
    return { granted: false, position: position + 1, expired: false };
  }

  /** Free the slot (after a successful or failed inference) and note it. */
  release(ticket: number): boolean {
    if (this.leaseHolder !== ticket) return false;
    this.busy = false;
    this.leaseHolder = null;
    this.leaseAt = 0;
    const now = this.now();
    this.dropExpired(now);
    return true;
  }

  /** Remove a ticket from the queue (client went away / deadline passed). */
  abandon(ticket: number): void {
    this.queue = this.queue.filter((w) => w.id !== ticket);
  }

  stats(): { busy: boolean; waiting: number; leaseHolder: number | null } {
    return { busy: this.busy, waiting: this.queue.length, leaseHolder: this.leaseHolder };
  }

  private dropExpired(now: number): void {
    this.queue = this.queue.filter((w) => {
      if (w.deadline > now) return true;
      return false;
    });
  }
}
