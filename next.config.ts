import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets other devices on the home network load dev resources (HMR etc.)
  // when testing the app on a real phone. Next blocks cross-origin dev
  // requests by default so a random site can't reach your dev server.
  //
  // Development only — this has no effect on a production build. If the
  // router hands out a different address, update this list.
  allowedDevOrigins: ["192.168.1.217"],
};

export default nextConfig;
