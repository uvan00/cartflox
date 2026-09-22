import type { NextConfig } from "next";

// Hote facultatif dedie a la page de paiement : checkout.mondomaine.com/<id>.
const CHECKOUT_HOST = process.env.CHECKOUT_HOST || "";

const nextConfig: NextConfig = {
  // Deux dossiers de construction en alternance (.next / .next-b) : on construit
  // dans celui qui ne sert pas, le serveur en ligne n'est jamais touche. Voir deploy/deploy.sh.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ['pg', '@prisma/client', 'pdfkit'],
  httpAgentOptions: {
    keepAlive: true,
  },
  experimental: {
    // Le logo est televerse puis garde en data URL via une Server Action :
    // la limite par defaut (1 Mo) rejetait les images de plus de ~750 Ko.
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
  async rewrites() {
    return {
      beforeFiles: CHECKOUT_HOST
        ? [
          // Adresse courte /<id> servie par /checkout/<id>. Le motif ne retient que des
          // identifiants (20 a 40 caracteres, minuscules et chiffres) : aucun chemin
          // du site ne peut lui ressembler.
          { source: "/success", has: [{ type: "host", value: CHECKOUT_HOST }], destination: "/checkout/success" },
          { source: "/:id([a-z0-9]{20,40})", has: [{ type: "host", value: CHECKOUT_HOST }], destination: "/checkout/:id" },
        ]
        : [],
      afterFiles: [],
      fallback: [],
    };
  },
  // SECURITY: baseline HTTP security headers. Conservative set : no global
  // X-Frame-Options/CSP so the hosted checkout (/checkout, /pay) can still be
  // embedded by merchants; clickjacking on the dashboard is mitigated by the
  // SameSite session cookie.
  async headers() {
    return [
      {
        // SoftPay : appels depuis le site du marchand (session avec cle publique,
        // moyens, lancement du paiement, statut).
        source: "/api/(checkout/initiate|checkout/verify|v1/checkout/sessions|v1/checkout/sessions/:id/methods|v1/checkout/sessions/:id/status)",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization, x-api-key, idempotency-key" },
          { key: "Access-Control-Max-Age", value: "86400" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
        ],
      },
    ];
  },
};

export default nextConfig;
