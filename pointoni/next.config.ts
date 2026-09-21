import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the sandboxed live-preview hosts (https://<port>-*.e2b.app) to load
  // dev assets and call same-origin API routes without origin rejection.
  allowedDevOrigins: ["*.e2b.app"],

  // Real-scale CDN posture (Cloudflare, 7 domains): static heavy bytes stay
  // cached at the edge for a year. The FRIEND engine runtime + model weights
  // and all imagery are immutable per version, so a visitor in any of the
  // 109 countries pays only the first trip through the closest edge.
  async headers() {
    return [
      {
        source: "/onnx/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          { key: "Timing-Allow-Origin", value: "*" },
        ],
      },
      {
        source: "/images/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
