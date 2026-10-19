import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // unpdf ships its own PDF.js build; keep it out of the server bundle.
  serverExternalPackages: ["unpdf"],
  // The bundled sample PDFs are read from disk when someone runs one live.
  outputFileTracingIncludes: { "/api/documents/[id]/extract": ["./public/samples/**"] },
};

export default nextConfig;
