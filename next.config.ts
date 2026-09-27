import type { NextConfig } from "next";
const privacyHeaders = [
  { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=()" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "DENY" },
];
const nextConfig: NextConfig = {
  // Vinext's multipart preflight shares this limit with Route Handlers.
  // The transcription route also independently bounds streamed bodies to 10 MB.
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
  async headers() {
    // Explicit root rule: the current Vinext wildcard matcher omits the empty path.
    return [
      { source: "/", headers: privacyHeaders },
      { source: "/:path*", headers: privacyHeaders },
    ];
  },
};
export default nextConfig;
