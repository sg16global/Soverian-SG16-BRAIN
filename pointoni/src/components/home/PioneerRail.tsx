"use client";

import { useEffect, useRef } from "react";
import { PIONEERS, type Pioneer } from "@/lib/pioneers";
import { Panel, PanelTitle } from "@/components/ui/Panel";

// A railway of historical pioneers travelling right -> left. One lightweight animation loop moves a single
// track by transform (no layout work), loops by exactly one set width so there is never a jump or a gap,
// and scales the card nearest the centre. It pauses off-screen, in hidden tabs, and for reduced motion.
const SPEED = 38; // px per second
const COPIES = 3;

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
}

function Card({ p }: { p: Pioneer }) {
  return (
    <li className="pioneer-card" data-card aria-label={`${p.name}, ${p.role}`}>
      <div className="pioneer-photo">
        {p.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.image} alt={p.name} width={180} height={180} draggable={false} />
        ) : (
          <span aria-hidden className="pioneer-initials">
            {initials(p.name)}
          </span>
        )}
      </div>
      <p className="pioneer-name">{p.name}</p>
      <p className="pioneer-role">{p.role}</p>
    </li>
  );
}

export function PioneerRail() {
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const vp = viewport.current;
    const tr = track.current;
    if (!vp || !tr) return;
    const cards = Array.from(tr.querySelectorAll<HTMLElement>("[data-card]"));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let stride = 0;
    let setWidth = 0;
    let half = 0;
    let offset = 0;
    let last = 0;
    let raf = 0;
    let visible = true;

    const measure = () => {
      stride = cards[1].offsetLeft - cards[0].offsetLeft;
      setWidth = stride * PIONEERS.length;
      half = vp.clientWidth / 2;
    };

    const paint = () => {
      tr.style.transform = `translate3d(${-offset}px,0,0)`;
      for (let i = 0; i < cards.length; i++) {
        const center = i * stride + stride / 2 - offset;
        const d = Math.min(1, Math.abs(center - half) / (half * 0.9));
        const k = 1 - d * d; // 1 at the centre, 0 near the edges
        cards[i].style.transform = `scale(${(0.82 + 0.26 * k).toFixed(3)})`;
        cards[i].style.opacity = (0.5 + 0.5 * k).toFixed(3);
        cards[i].dataset.center = k > 0.9 ? "1" : "0";
      }
    };

    const frame = (t: number) => {
      raf = 0;
      if (!visible || document.hidden) return;
      const dt = last ? Math.min(0.1, (t - last) / 1000) : 0;
      last = t;
      offset = (offset + SPEED * dt) % setWidth;
      paint();
      raf = requestAnimationFrame(frame);
    };
    const start = () => {
      if (reduce || raf) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    };

    measure();
    paint();
    start();

    const ro = new ResizeObserver(() => {
      measure();
      paint();
    });
    ro.observe(vp);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) start();
    });
    io.observe(vp);
    const onVis = () => {
      if (!document.hidden) start();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const credited = PIONEERS.filter((p) => p.credit);

  return (
    <Panel className="mx-auto w-full max-w-[1200px] overflow-hidden px-2 py-5 sm:px-5" id="pioneers">
      <PanelTitle accent="cyan">AI PIONEERS</PanelTitle>
      <p className="mt-1 text-center font-mono2 text-[9px] tracking-[0.3em] text-slate-400 sm:text-[10px]">
        INTELLIGENCE HERITAGE · THE PEOPLE BEHIND THE IDEAS
      </p>

      <div ref={viewport} className="pioneer-viewport mt-4" role="region" aria-label="AI pioneers, moving slowly">
        <ul ref={track} className="pioneer-track">
          {Array.from({ length: COPIES }).flatMap((_, c) =>
            PIONEERS.map((p) => <Card key={`${c}-${p.id}`} p={p} />),
          )}
        </ul>
      </div>

      <p className="mt-3 text-center font-mono2 text-[9px] tracking-[0.2em] text-slate-500">
        HISTORICAL PROFILES · NOT AI MODELS · NOT CONNECTED TO THIS SYSTEM
      </p>
      <details className="mx-auto mt-2 max-w-[760px] text-center">
        <summary className="cursor-pointer font-mono2 text-[9px] tracking-[0.2em] text-slate-500 hover:text-slate-300">
          PORTRAIT CREDITS
        </summary>
        <ul className="mt-2 space-y-0.5 text-[10px] leading-snug text-slate-400">
          {credited.map((p) => (
            <li key={p.id}>
              {p.name} — {p.credit!.author},{" "}
              <a href={p.credit!.source} target="_blank" rel="noreferrer" className="underline decoration-slate-600 hover:text-white">
                {p.credit!.license}
              </a>
            </li>
          ))}
          <li>Arthur Samuel — initials card until a freely usable photograph is added.</li>
        </ul>
      </details>
    </Panel>
  );
}
