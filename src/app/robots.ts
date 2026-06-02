import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/painel/', '/checkout/', '/conta/', '/perfil/', '/api/'],
      },
    ],
    sitemap: 'https://mikmalencois.com.br/sitemap.xml',
  };
}
