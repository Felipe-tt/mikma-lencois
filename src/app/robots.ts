import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/painel', '/checkout', '/api/', '/conta/', '/perfil/'],
      },
    ],
    sitemap: 'https://mikma.com.br/sitemap.xml',
  };
}
