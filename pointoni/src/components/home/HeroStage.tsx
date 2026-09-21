import { Emblem } from "@/components/chrome/Emblem";
import { HERO_PILLARS } from "@/lib/content";

function Pillar({ label }: { label: string }) {
  return (
    <li className="flex items-center gap-3">
      <span className="relative grid h-5 w-5 flex-none place-items-center">
        <span className="absolute inset-0 rounded-full border border-cyan-300/70" />
        <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_8px_rgba(57,215,255,.9)]" />
      </span>
      <span className="font-display text-[12px] font-bold tracking-[0.18em] text-cyan-200 sm:text-[13px]">
        {label.toUpperCase()}
      </span>
    </li>
  );
}

function Pedestal() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-[-70px] h-[90px]">
      <div className="absolute left-1/2 top-10 h-[70px] w-[78%] -translate-x-1/2 rounded-[50%] bg-red-600/25 blur-2xl" />
      <div className="pedestal" style={{ width: "74%", height: "26px", bottom: "0" }} />
      <div className="pedestal" style={{ width: "92%", height: "30px", bottom: "-22px" }} />
      <div className="pedestal" style={{ width: "112%", height: "34px", bottom: "-46px" }} />
    </div>
  );
}

function GlobeModule() {
  return (
    <div className="relative mx-auto w-[240px] sm:w-[280px]">
      <div className="relative aspect-square">
        <div
          className="absolute inset-0 rounded-full spin-slow"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0deg, rgba(57,150,255,.35) 40deg, transparent 90deg, transparent 200deg, rgba(255,60,70,.3) 250deg, transparent 300deg)",
            maskImage: "radial-gradient(circle, transparent 62%, black 63%)",
            WebkitMaskImage: "radial-gradient(circle, transparent 62%, black 63%)",
          }}
        />
        <div className="absolute inset-3 rounded-full border border-blue-400/30 spin-rev" />
        <div className="absolute inset-7 rounded-full border border-blue-400/20" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/globe.png"
          alt="One brain global vision network globe"
          className="absolute inset-4 h-[calc(100%-32px)] w-[calc(100%-32px)] rounded-full object-cover"
          style={{ mixBlendMode: "screen", filter: "drop-shadow(0 0 24px rgba(60,140,255,.55))" }}
        />
      </div>
      <div className="absolute inset-x-0 top-[30%] text-center">
        <p className="font-display text-[13px] font-black leading-tight tracking-wide text-white drop-shadow-[0_0_8px_rgba(0,0,0,.9)]">
          ONE BRAIN
          <br />
          GLOBAL VISION
          <br />
          A SMARTER WORLD
        </p>
      </div>
      <div className="absolute inset-x-0 bottom-[2%] text-center">
        <p className="font-display text-[11px] font-black leading-[1.35] tracking-[0.14em] text-cyan-300 drop-shadow-[0_0_8px_rgba(57,215,255,.8)]">
          LEARN · BUILD
          <br />
          INNOVATE · GROW
          <br />
          TOGETHER
        </p>
      </div>
    </div>
  );
}

export function HeroStage() {
  return (
    <section id="home" className="relative mx-auto max-w-[1200px] px-3 pb-20 pt-8 sm:px-5 sm:pt-12">
      <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto_1fr]">
        {/* Left: headline */}
        <div className="order-2 text-center lg:order-1 lg:text-left">
          <h1 className="font-display text-[26px] font-black leading-[1.05] tracking-wide text-white sm:text-[34px] xl:text-[40px]">
            SOVEREIGN
            <br />
            INTELLIGENCE
            <br />
            FOR A BRIGHTER
            <br />
            <span className="text-tomorrow-gradient text-[34px] sm:text-[44px] xl:text-[52px]" style={{ filter: "drop-shadow(0 0 18px rgba(255,40,60,.45))" }}>
              TOMORROW
            </span>
          </h1>
          <ul className="mt-6 space-y-2.5">
            {HERO_PILLARS.map((p) => (
              <Pillar key={p} label={p} />
            ))}
          </ul>
        </div>

        {/* Center: emblem on neon pedestal */}
        <div className="relative order-1 flex justify-center lg:order-2">
          <div className="relative w-[240px] sm:w-[290px] lg:w-[320px] xl:w-[350px]">
            <Emblem className="w-full" />
            <Pedestal />
          </div>
        </div>

        {/* Right: globe */}
        <div className="order-3 flex justify-center lg:justify-end">
          <GlobeModule />
        </div>
      </div>
    </section>
  );
}
