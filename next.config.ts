import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // fotos de produto enviadas pelo formulário (até 10 MB)
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
