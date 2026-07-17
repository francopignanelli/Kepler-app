import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * CSP:
 * - script-src: 'unsafe-eval' solo en dev (lo requiere el runtime de Next);
 *   'unsafe-inline' es necesario para los scripts inline de hidratación de Next
 *   (endurecible a nonces si se suma middleware).
 * - img-src: unpkg (texturas del globo) y cdn.weatherapi.com (íconos de clima).
 * - connect-src: solo mismo origen — el frontend nunca habla con APIs externas.
 * - frame-src: solo el player embebido de YouTube (variante nocookie).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://unpkg.com https://cdn.weatherapi.com https://server.arcgisonline.com https://cdn.eso.org https://i.ytimg.com https://openweathermap.org",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src https://www.youtube-nocookie.com",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
