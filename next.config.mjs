import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@node-rs/argon2', 'firebase-admin', 'baileys'],

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
    formats: ['image/avif', 'image/webp'],
    // Tamanhos usados no app — evita gerar versões desnecessárias
    deviceSizes: [375, 640, 828, 1080, 1280],
    imageSizes: [64, 128, 256, 384],
    // Cache de imagens otimizadas por 7 dias no CDN
    minimumCacheTTL: 604800,
  },

  async headers() {
    return [
      {
        // Assets estáticos com hash: cache de 1 ano (imutáveis)
        source: '/_next/static/(.*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        // Logos e favicons: 7 dias
        source: '/(logo.*|favicon.*|apple-touch-icon.*|hero-bg.*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=2592000' }],
      },
      {
        // Fontes: 1 ano
        source: '/_next/static/media/(.*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/(.*)',
        headers: [{ key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' }],
      },
    ];
  },
};
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Sem org/project/authToken, o plugin simplesmente pula o upload de
  // sourcemaps (loga um aviso, não falha o build) — então isso é seguro
  // de deixar ligado mesmo antes de criar a conta no Sentry.
  silent: true,
  widenClientFileUpload: true,
  webpack: {
    treeshake: { removeDebugLogging: true },
    reactComponentAnnotation: { enabled: true },
  },
});
