import { Globe } from "lucide-react";

// Ring labels: angle in degrees, 0 = top, clockwise positive.
const RING = [
  { label: "UK", angle: -128 },
  { label: "FRANCE", angle: -82 },
  { label: "RUSSIA", angle: -32 },
  { label: "CHINA", angle: 28 },
  { label: "GERMANY", angle: 82 },
  { label: "USA", angle: 152 },
];

export function Emblem({ className = "w-[300px]" }: { className?: string }) {
  return (
    <div
      className={`relative aspect-square float-slow ${className}`}
      style={{ containerType: "inline-size" }}
      aria-label="Sovereign SG16 Brain official seal"
    >
      {/* metallic seal base */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/emblem-base.png"
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full rounded-full object-cover"
        style={{
          filter: "drop-shadow(0 0 26px rgba(255,180,60,.35)) drop-shadow(0 0 60px rgba(255,31,46,.35))",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 38%, rgba(0,0,0,0) 55%, rgba(0,0,0,.28) 100%)",
        }}
      />

      {/* country labels around the gold ring */}
      {RING.map((c) => (
        <div
          key={c.label}
          className="pointer-events-none absolute inset-0"
          style={{ transform: `rotate(${c.angle}deg)` }}
        >
          <span
            className="absolute left-1/2 font-display"
            style={{
              top: "3.4%",
              transform: `translateX(-50%) rotate(${-c.angle}deg)`,
              fontSize: "2.5cqw",
              fontWeight: 900,
              letterSpacing: "0.1em",
              color: "#171004",
              textShadow: "0 1px 0 rgba(255,225,150,.9), 0 -1px 1px rgba(0,0,0,.4)",
              whiteSpace: "nowrap",
            }}
          >
            {c.label}
          </span>
        </div>
      ))}

      {/* main title plaque */}
      <div
        className="absolute left-[9.5%] right-[9.5%] flex items-center justify-center gap-[0.4em] rounded-[0.5em] border-[3px] border-[#f5c44c] px-[0.6em] py-[0.35em]"
        style={{
          top: "44.5%",
          background: "linear-gradient(180deg, rgba(10,16,14,.97), rgba(2,6,5,.99))",
          boxShadow:
            "0 0 0 2px rgba(0,0,0,.6), 0 0 18px rgba(255,190,70,.45), inset 0 0 14px rgba(255,210,120,.12)",
          fontSize: "2.1cqw",
        }}
      >
        <span
          className="font-display font-black leading-none"
          style={{
            fontSize: "2.35em",
            background: "linear-gradient(180deg,#8dff7a 0%,#2ee05a 55%,#0c9c47 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            filter: "drop-shadow(0 0 10px rgba(46,224,90,.55))",
          }}
        >
          Sovereign
        </span>
        <span
          className="font-display font-black leading-none"
          style={{
            fontSize: "2.35em",
            background: "linear-gradient(180deg,#ffe9a8 0%,#ffb52e 50%,#ff6a1f 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            filter: "drop-shadow(0 0 10px rgba(255,150,40,.5))",
          }}
        >
          SG16 Brain
        </span>
      </div>

      {/* tagline */}
      <div
        className="absolute left-[17%] right-[17%] text-center font-semibold leading-[1.35]"
        style={{
          top: "56.5%",
          fontSize: "1.85cqw",
          color: "#ffe39e",
          textShadow: "0 1px 2px #000, 0 0 10px rgba(255,200,90,.35)",
        }}
      >
        Self-hosted Mistral engine by
        <br />
        SG16 Brain &mdash; built
        <br />
        for ownership, not dependency
        <br />
        on third-party AI APIs.
      </div>

      {/* gold model banner */}
      <div
        className="absolute left-[12%] right-[12%] flex items-center justify-center gap-[0.5em] rounded-[0.3em] border-2 border-[#7a5210] py-[0.28em] font-display font-black"
        style={{
          top: "74.6%",
          background: "linear-gradient(180deg,#ffe39c,#e8aa37 55%,#b9791a)",
          color: "#1c1103",
          fontSize: "2.35cqw",
          letterSpacing: "0.1em",
          boxShadow: "0 0 14px rgba(255,190,70,.5)",
        }}
      >
        <span className="inline-block h-[0.5em] w-[0.5em] rotate-45 bg-[#1c1103]" />
        SOVEREIGN BRAIN &bull; MISTRAL X INSTRUCT
        <span className="inline-block h-[0.5em] w-[0.5em] rotate-45 bg-[#1c1103]" />
      </div>

      {/* TM */}
      <div
        className="absolute left-1/2 flex -translate-x-1/2 items-center justify-center rounded-full border-2 border-[#f5c44c] font-display font-bold"
        style={{
          top: "80.6%",
          width: "5.4cqw",
          height: "5.4cqw",
          fontSize: "2.1cqw",
          color: "#ffd98a",
          background: "rgba(0,0,0,.55)",
        }}
      >
        TM
      </div>

      {/* Apache badge */}
      <div
        className="absolute left-1/2 -translate-x-1/2 rounded-[0.25em] border-[3px] border-[#f5c44c] px-[0.7em] py-[0.18em] font-display font-black"
        style={{
          top: "87.4%",
          fontSize: "3.35cqw",
          letterSpacing: "0.06em",
          color: "#f4f6ff",
          background: "linear-gradient(180deg,#c92f3b,#7c0d18)",
          boxShadow: "0 0 16px rgba(255,40,55,.6), inset 0 1px 0 rgba(255,255,255,.3)",
          textShadow: "0 2px 2px rgba(0,0,0,.6)",
        }}
      >
        APACHE 2.0
      </div>

      {/* domain plaque */}
      <div
        className="absolute left-1/2 flex -translate-x-1/2 items-center gap-[0.4em] rounded-full border-2 border-[#f5c44c] px-[0.8em] py-[0.16em] font-display font-bold"
        style={{
          top: "94.2%",
          fontSize: "2.35cqw",
          color: "#ffd98a",
          background: "rgba(8,10,6,.85)",
          boxShadow: "0 0 12px rgba(255,190,70,.4)",
          whiteSpace: "nowrap",
        }}
      >
        <Globe style={{ width: "1.05em", height: "1.05em" }} strokeWidth={2.4} />
        mistralbrain.com
      </div>
    </div>
  );
}
