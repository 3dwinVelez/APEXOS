import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  outputFileTracingRoot: path.join(__dirname, "../..")
};

export default nextConfig;
