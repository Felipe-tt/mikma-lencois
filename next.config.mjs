/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@node-rs/argon2', 'firebase-admin'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' }
    ],
    // Serve WebP e AVIF: arquivos menores, menos bandwidth no Cloud Run
    formats: ['image/avif', 'image/webp'],
  },
  async headers() {
    return [
      {
        // Assets estáticos com hash: cache longo → menos requests ao Cloud Run
        source: '/_next/static/(.*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        // Logos e favicons: cache de 1 dia com revalidação em background
        source: '/(logo.*|favicon.*|apple-touch-icon.*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }],
      },
      {
        source: '/(.*)',
        headers: [{ key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' }],
      },
    ];
  },
}
export default nextConfig
