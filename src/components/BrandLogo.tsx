import Image from 'next/image';

interface Props {
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
  /** Largura exibida (o logo nunca passa de ~140px): sem isso o navegador
   *  baixava a versão de 828–1280px pra mostrar 106px. */
  sizes?: string;
}

/**
 * Logo da marca que se adapta ao tema. Usa dois <Image> empilhados e
 * `dark:` (classe no <html>, ver ThemeScript/ThemeToggle) pra trocar
 * qual fica visível, sem precisar de JS/estado pra saber o tema atual.
 * Use sempre que o logo estiver sobre uma superfície que também troca
 * de cor no dark mode (bg-paper, bg-warm etc). Para superfícies que
 * ficam sempre escuras (ex: footer com `theme-locked`), use direto
 * `/logo-white.png`.
 */
export function BrandLogo({ alt, className = 'h-8 w-auto object-contain', width = 800, height = 242, priority = false, sizes = '140px' }: Props) {
  return (
    <>
      <Image src="/logo-dark.png" alt={alt} width={width} height={height} className={`${className} dark:hidden`} priority={priority} sizes={sizes} />
      <Image src="/logo-white.png" alt={alt} width={width} height={height} className={`${className} hidden dark:block`} priority={priority} sizes={sizes} />
    </>
  );
}
