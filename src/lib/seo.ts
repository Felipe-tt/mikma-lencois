import type { Metadata } from 'next';

export const SITE_NAME = 'Mikma Lençóis';

// O que a loja vende, numa frase só: usada na descrição do site e nos dados
// estruturados que Google e assistentes (Gemini etc.) leem. Sem isso eles
// completavam com produtos que a loja não tem (edredons, cobre-leitos).
export const STORE_SUMMARY = 'Loja de fábrica em Blumenau (SC) de lençóis, fronhas e jogos de lençol em malha 100% algodão.';
export const SITE_DESCRIPTION = 'Lençóis, fronhas e jogos de lençol em malha 100% algodão, direto da fábrica em Blumenau. Entrega em Blumenau em 1h ou para todo o Brasil.';

/** Dados da loja (schema.org) presentes em todas as páginas. */
export const STORE_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'Store',
  name: SITE_NAME,
  url: 'https://mikma.com.br',
  logo: 'https://mikma.com.br/favicon-192-google.png',
  image: 'https://mikma.com.br/og-image.jpg',
  description: STORE_SUMMARY,
  address: { '@type': 'PostalAddress', addressLocality: 'Blumenau', addressRegion: 'SC', addressCountry: 'BR' },
  parentOrganization: { '@type': 'Organization', name: 'GPM Têxtil' },
  makesOffer: ['Lençóis', 'Fronhas', 'Jogos de lençol'].map(name => ({
    '@type': 'Offer',
    itemOffered: { '@type': 'Product', name, material: 'Malha 100% algodão' },
  })),
};

const OG_IMAGE = { url: '/og-image.jpg', width: 1200, height: 630, alt: 'Mikma Lençóis · Lençóis, fronhas e jogos de lençol' };

/** Base do Open Graph. O Next substitui o objeto `openGraph` inteiro em cada
 *  página (não mescla com o do layout): sem espalhar esta base, catálogo e
 *  Sobre perdiam imagem, nome do site e idioma nas prévias de compartilhamento. */
export const baseOpenGraph = {
  type: 'website' as const,
  locale: 'pt_BR',
  siteName: SITE_NAME,
  images: [OG_IMAGE],
};

/** Open Graph + Twitter de uma página, com título e descrição dela. */
export function shareMeta(opts: {
  title: string;
  description?: string;
  path: string;
  images?: { url: string; alt?: string; width?: number; height?: number }[];
}): Pick<Metadata, 'openGraph' | 'twitter'> {
  const title = `${opts.title} · ${SITE_NAME}`;
  const images = opts.images && opts.images.length > 0 ? opts.images : baseOpenGraph.images;
  return {
    openGraph: { ...baseOpenGraph, title, description: opts.description, url: opts.path, images },
    twitter: { card: 'summary_large_image', title, description: opts.description, images: images.map(i => i.url) },
  };
}
