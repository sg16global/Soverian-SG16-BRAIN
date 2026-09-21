// The official Sovereign SG16 Brain seal.
// emblem-base.png already carries the full artwork (title, country ring,
// tagline, banner, TM, Apache 2.0 badge and domain), so this component
// renders the seal unchanged and adds only the stage glow + float animation.
export function Emblem({ className = "w-[300px]" }: { className?: string }) {
  return (
    <div
      className={`relative aspect-square float-slow ${className}`}
      style={{ containerType: "inline-size" }}
      aria-label="Sovereign SG16 Brain official seal"
    >
      {/* official seal artwork (byte-for-byte original) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/emblem-base.png"
        alt="Sovereign SG16 Brain official seal"
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
    </div>
  );
}
