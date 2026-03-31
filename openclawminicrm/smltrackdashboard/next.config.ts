import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // basePath ลบออก — Cloudflare Tunnel route /dashboard → dashboard:3001
  // ถ้า basePath: "/dashboard" + Nginx/CF route /dashboard → ซ้อนเป็น /dashboard/dashboard/
  output: "standalone",
};

export default nextConfig;
