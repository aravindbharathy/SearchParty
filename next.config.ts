import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Exclude heavy packages from server bundle
  serverExternalPackages: ['yaml'],
};

export default nextConfig;
