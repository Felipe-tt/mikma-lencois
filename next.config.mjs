/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@node-rs/argon2', 'firebase-admin'],

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
export default nextConfig;
