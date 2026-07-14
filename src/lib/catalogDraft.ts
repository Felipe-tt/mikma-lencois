// Schema compartilhado dos rascunhos de catálogo — importados de um CSV
// qualquer, ficam salvos como rascunho (sem afetar a loja) até alguém
// terminar de revisar/completar os campos e publicar como produto de verdade.
import { z } from 'zod';
import { SIZES } from '@/lib/productOptions';

export const DraftImageSchema = z.object({
  url: z.string().url().max(500),
  path: z.string().max(300), // caminho no Storage, pra permitir apagar depois
});

// Campos livres na importação (o CSV de origem raramente bate 100% com o
// enum de tamanho/categoria da loja) — size/category ficam como string aberta
// no rascunho, e só são validados contra o enum na hora de publicar.
export const CatalogDraftSchema = z.object({
  name: z.string().max(200).default(''),
  description: z.string().max(2000).default(''),
  category: z.string().max(100).default(''),
  size: z.string().max(50).default(''),
  fabric: z.string().max(100).default(''),
  colorName: z.string().max(64).default(''),
  colorHex: z.string().max(16).default(''),
  priceBRL: z.number().nonnegative().max(100_000).nullable().default(null),
  weightKg: z.number().nonnegative().max(200).nullable().default(null),
  images: z.array(DraftImageSchema).max(20).default([]),
  sourceRaw: z.string().max(1000).default(''), // linha original do CSV, pra conferência
});

export type CatalogDraftInput = z.infer<typeof CatalogDraftSchema>;

// Mesmo schema mas todos os campos opcionais — usado no PATCH parcial.
export const CatalogDraftPatchSchema = CatalogDraftSchema.partial();

export function isDraftReadyToPublish(d: Partial<CatalogDraftInput>): string | null {
  if (!d.name || d.name.trim().length < 2) return 'Nome muito curto';
  if (!d.priceBRL || d.priceBRL <= 0) return 'Preço inválido';
  if (!d.category || d.category.trim().length === 0) return 'Categoria obrigatória';
  if (!d.size || !(SIZES as readonly string[]).includes(d.size)) return 'Tamanho inválido';
  if (!d.images || d.images.length === 0) return 'Adicione ao menos uma imagem';
  return null;
}
