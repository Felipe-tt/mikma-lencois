import type { Metadata } from 'next';

export const SITE_NAME = 'Mikma Lençóis';

const OG_IMAGE = { url: '/og-image.jpg', width: 1200, height: 630, alt: 'Mikma Lençóis · Lençóis e jogos de cama' };

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
