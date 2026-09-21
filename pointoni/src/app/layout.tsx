import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sovereign SG16 Brain \u2014 Global AI Intelligence Network",
  description:
    "SG16-powered AI global intelligence network. A self-hosted Mistral engine built for ownership, not dependency on third-party AI APIs. Knowledge \u00B7 Diplomacy \u00B7 A Better Tomorrow.",
  keywords: ["Sovereign AI", "SG16 Brain", "Mistral", "multi-model AI", "self-hosted AI"],
  applicationName: "Sovereign SG16 Brain",
  creator: "SAIF TECH GLOBAL LLC",
  publisher: "SAIF TECH GLOBAL LLC",
  icons: { icon: "/images/emblem-base.png", apple: "/images/emblem-base.png" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;600;700;800;900&family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen antialiased">
        <div className="red-atmosphere" aria-hidden />
        <div className="red-stage" aria-hidden />
        <div className="red-horizon" aria-hidden />
        {children}
      </body>
    </html>
  );
}
