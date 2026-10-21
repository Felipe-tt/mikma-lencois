import { SIZE_LABEL } from '@/lib/productOptions';
import { hexToColorName } from '@/lib/colorNames';
import { formatColorName } from '@/lib/colorNameMatch';

/**
 * "Casal · Malha · Terracota" em vez de "casal · Malha · #B8622F": o
 * estoque e o histórico mostravam o código cru da variação.
 */
export function variantLabel(variant: { size?: string; fabric?: string; color?: string; colorName?: string }): string {
  const { size, fabric, color, colorName } = variant;
  const colorLabel = colorName ? formatColorName(colorName) : (color?.startsWith('#') ? hexToColorName(color) : color);
  return [size ? (SIZE_LABEL[size] ?? size) : undefined, fabric, colorLabel].filter(Boolean).join(' · ');
}
