import type { NextConfig } from "next";

// En-têtes de sécurité appliqués à toutes les pages.
const securityHeaders = [
  // Interdit l'affichage du site dans une iframe (protection contre le « clickjacking »).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Le site n'utilise ni micro, ni géolocalisation. La caméra n'est pas
  // nécessaire : les étudiants scannent le QR avec l'appareil photo du téléphone.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
