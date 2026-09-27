import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SpeakSense · Live Coach",
  description:
    "Guidance while you speak. Practice or present with sparse live cues, then review the evidence.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
