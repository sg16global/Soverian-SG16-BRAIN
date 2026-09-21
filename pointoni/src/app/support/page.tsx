"use client";

import { useEffect, useState } from "react";
import { ChevronDown, LifeBuoy, Send } from "lucide-react";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { FAQS } from "@/lib/content";

type Ticket = {
  id: string;
  subject: string;
  status: string;
  response: string | null;
  createdAt: string;
};

export default function SupportPage() {
  const [openFaq, setOpenFaq] = useState<number>(0);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadTickets() {
    const res = await fetch("/api/tickets?kind=support", { cache: "no-store" });
    if (res.ok) setTickets((await res.json()).tickets ?? []);
  }
  useEffect(() => {
    loadTickets();
  }, []);

  async function submit() {
    if (!subject.trim() || !body.trim()) {
      setError("Subject and message are required.");
      return;
    }
    setSending(true);
    setError(null);
    const res = await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "support", subject, bodyText: body }),
    });
    if (res.ok) {
      setSubject("");
      setBody("");
      loadTickets();
    } else {
      setError("Could not submit the ticket. Try again.");
    }
    setSending(false);
  }

  return (
    <SiteChrome>
      <PageHeader title="HELP & SUPPORT" subtitle="Answers from the SG16 knowledge core, plus a tracked support desk staffed by real human engineers." />
      <div className="mx-auto grid max-w-[1000px] gap-5 px-4 py-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          <h2 className="font-display text-sm font-black tracking-widest text-gold-gradient">FREQUENTLY ASKED</h2>
          {FAQS.map((f, i) => (
            <Panel key={f.q} soft corners={false}>
              <button
                onClick={() => setOpenFaq(openFaq === i ? -1 : i)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
              >
                <span className="text-[13.5px] font-bold text-slate-100">{f.q}</span>
                <ChevronDown className={`h-4 w-4 flex-none text-red-400 transition-transform ${openFaq === i ? "rotate-180" : ""}`} />
              </button>
              {openFaq === i && (
                <p className="border-t border-white/10 px-4 py-3 text-[12.5px] leading-relaxed text-slate-300">{f.a}</p>
              )}
            </Panel>
          ))}

          {tickets && tickets.length > 0 && (
            <div className="pt-3">
              <h2 className="mb-3 font-display text-sm font-black tracking-widest text-gold-gradient">YOUR TICKETS</h2>
              <ul className="space-y-2.5">
                {tickets.map((t) => (
                  <li key={t.id}>
                    <Panel soft corners={false} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-[13px] font-semibold text-slate-100">{t.subject}</p>
                        <span className="flex-none rounded bg-amber-500/15 px-2 py-0.5 font-mono2 text-[9px] tracking-widest text-amber-300">
                          {t.status.toUpperCase()}
                        </span>
                      </div>
                      <p className="font-mono2 text-[9px] tracking-widest text-slate-500">
                        REF {t.id.slice(0, 8).toUpperCase()} · {new Date(t.createdAt).toLocaleString()}
                      </p>
                      {t.response && <p className="mt-2 rounded border border-emerald-400/25 bg-emerald-500/5 p-2.5 text-[12px] text-emerald-100/90">{t.response}</p>}
                    </Panel>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <Panel className="corner h-fit p-5">
          <h2 className="flex items-center gap-2 font-display text-sm font-black tracking-widest text-white">
            <LifeBuoy className="h-5 w-5 text-red-400" /> OPEN A TICKET
          </h2>
          <div className="mt-4 space-y-3">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="input-dark h-11 w-full px-3 text-sm"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Describe the issue or question…"
              rows={6}
              className="input-dark w-full resize-none p-3 text-sm"
            />
            {error && <p className="text-[12px] text-red-300">{error}</p>}
            <button onClick={submit} disabled={sending} className="btn-red flex w-full items-center justify-center gap-2 py-2.5 text-[11px] disabled:opacity-50">
              <Send className="h-4 w-4" /> {sending ? "SUBMITTING…" : "SUBMIT TICKET"}
            </button>
          </div>
        </Panel>
      </div>
    </SiteChrome>
  );
}
