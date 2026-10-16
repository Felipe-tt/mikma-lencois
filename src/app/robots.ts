import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/painel', '/checkout', '/api/', '/conta/', '/perfil/',
          // Páginas privadas/transacionais, sem valor de busca.
          '/carrinho', '/favoritos', '/pedidos', '/redefinir-senha', '/confirmar-login',
        ],
      },
    ],
    sitemap: 'https://mikma.com.br/sitemap.xml',
  };
}
