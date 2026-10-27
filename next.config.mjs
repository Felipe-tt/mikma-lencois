import { withSentryConfig } from '@sentry/nextjs/config';

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@node-rs/argon2', 'firebase-admin'],

  // Sentry só pra erros: corta do bundle os logs de debug e o rastreamento
  // de performance (2% das visitas, que ninguém olhava e passava pelo
  // túnel /monitoring). As opções de "treeshake" do Sentry lá embaixo só
  // valem pro webpack, e o build usa Turbopack.
  compiler: {
    define: { __SENTRY_DEBUG__: 'false', __SENTRY_TRACING__: 'false' },
  },

  images: {
    // Só as fotos do bucket da loja: antes qualquer bucket do Firebase (e
    // qualquer imagem do Google) podia ser otimizada aqui, queimando CPU e
    // banda do servidor com imagens de terceiros.
    remotePatterns: [
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com', pathname: '/v0/b/mikma-lencois.firebasestorage.app/o/**' },
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com', pathname: '/v0/b/mikma-lencois.appspot.com/o/**' },
    ],
    // Só WebP: AVIF custa 5-10x mais CPU pra codificar no Cloud Run (1 vCPU)
    // e o ganho de tamanho sobre WebP é pequeno nas fotos de produto.
    formats: ['image/webp'],
    // Tamanhos usados no app, evita gerar versões desnecessárias
    deviceSizes: [375, 640, 828, 1080, 1280],
    imageSizes: [64, 128, 256, 384],
    // Cache de imagens otimizadas por 7 dias no CDN
    minimumCacheTTL: 604800,
  },

  async headers() {
    return [
      {
        // Assets estáticos com hash: cache de 1 ano (imutáveis). Reaplicado
        // porque o App Hosting não herda o cache automático de 1 ano que um
        // Next.js "puro" aplicaria — sem isso, medimos só 1h de TTL real em
        // produção (visto no relatório do PageSpeed Insights).
        source: '/_next/static/(.*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        // Logos e favicons: 7 dias
        source: '/(logo.*|favicon.*|apple-touch-icon.*|hero-bg.*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=2592000' }],
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
  // sourcemaps (loga um aviso, não falha o build), então isso é seguro
  // de deixar ligado mesmo antes de criar a conta no Sentry.
  silent: true,
  widenClientFileUpload: true,
  // Ad-blockers (uBlock, Brave, etc.) bloqueiam por padrão qualquer
  // request pra *.sentry.io / *.ingest.*, então boa parte dos usuários
  // reais nunca conseguia mandar erro nenhum (era isso que aparecia
  // como "blocked by CORS policy" no console, não é CORS de verdade,
  // é a extensão matando a request antes de sair do navegador).
  // Com tunnelRoute, o SDK do navegador manda pra uma rota do nosso
  // próprio domínio (mikma.com.br/monitoring), que o servidor repassa
  // pro Sentry por trás, invisível pra bloqueadores de anúncio.
  tunnelRoute: '/monitoring',
  webpack: {
    treeshake: { removeDebugLogging: true },
    reactComponentAnnotation: { enabled: true },
  },
});
