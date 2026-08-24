import type { NextConfig } from "next";
import path from "node:path";
import { configuredConnectOrigin } from "./lib/security/csp";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  compress: true,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"]
  },
  async headers() {
    const apiOrigin = configuredConnectOrigin(process.env.NEXT_PUBLIC_API_URL);
    const scriptSrc = process.env.NODE_ENV === "development"
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : "script-src 'self' 'unsafe-inline'";

    return [
      {
        source: "/:all*(svg|jpg|jpeg|png|webp|avif|gif|ico|woff|woff2)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable"
          }
        ]
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              scriptSrc,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              `connect-src 'self' https: wss:${apiOrigin ? ` ${apiOrigin}` : ""}`,
              "font-src 'self' data:",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'"
            ].join("; ")
          }
        ]
      }
    ];
  }
};

export default nextConfig;
