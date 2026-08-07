import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Diese Pakete verwenden native Bindings bzw. dynamische, __dirname-basierte
  // Dateipfade (Worker-Threads, native .node-Module). Wenn Next.js sie mit
  // webpack in das Server-Bundle einbündelt, werden diese Pfade falsch
  // aufgelöst. Als "external" markiert, bleiben sie normale Node-Requires,
  // die zur Laufzeit korrekt über node_modules aufgelöst werden.
  serverExternalPackages: ["tesseract.js", "tesseract.js-core", "pdf-parse", "nats"],
};

export default nextConfig;
