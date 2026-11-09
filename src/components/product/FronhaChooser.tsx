'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Overlay } from '@/components/ui/Overlay';
import { IconX } from '@/components/ui/Icon';

/**
 * Troca da fronha de um jogo de cama, igual na página do produto e no
 * "Montar junto": uma linha com a fronha escolhida e, ao tocar em trocar,
 * uma janela com as estampas em fotos grandes. Cada estampa pode ser
 * ampliada antes de escolher (a lupa no canto), porque estampa pequena
 * não dá para entender.
 */

export interface FronhaOption {
  /** SKU da fronha avulsa (produto_variação), o que vai no carrinho. */
  sku: string;
  /** "Floral Rosa", "Verde": o que diferencia uma fronha da outra. */
  label: string;
  image?: string;
  color?: string;
  available: boolean;
}

interface Props {
  options: FronhaOption[];
  /** SKU escolhido, ou null para a fronha que já vem no jogo. */
  value: string | null;
  onChange: (sku: string | null) => void | Promise<void>;
  /** Quantas fronhas o jogo traz (1 no solteiro). */
  fronhaCount: number;
  /** Foto do próprio jogo, para a opção "a que vem no jogo". */
  defaultImage?: string;
  disabled?: boolean;
  /** Linha menor, para o item do carrinho. */
  compact?: boolean;
}

export function FronhaChooser({ options, value, onChange, fronhaCount, defaultImage, disabled, compact }: Props) {
  const [open, setOpen] = useState(false);
  const chosen = options.find(o => o.sku === value);
  const one = fronhaCount === 1;
  const thumb = compact ? 44 : 64;

  return (
    <>
      <div className={`flex items-center gap-3 ${compact ? '' : 'rounded-2xl border border-mist bg-paper p-3'}`}>
        <Thumb option={chosen} fallback={defaultImage} size={thumb} />
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-faint truncate">
            {one ? 'Fronha do jogo' : `${fronhaCount} fronhas do jogo`}
          </p>
          <p className={`${compact ? 'text-[12.5px]' : 'text-[14px]'} text-ink truncate`}>
            {chosen ? chosen.label : 'A que vem no jogo'}
          </p>
          {!compact && <p className="text-[11.5px] text-faint">Trocar a estampa não custa nada.</p>}
        </div>
        <button type="button" disabled={disabled} onClick={() => setOpen(true)} aria-label={chosen ? `Trocar a estampa (${chosen.label})` : 'Trocar a estampa'}
          className={`shrink-0 rounded-full border border-mist-d font-medium text-ink hover:border-ink transition-colors disabled:opacity-40 ${compact ? 'h-9 px-3 text-[12px]' : 'h-10 px-4 text-[13px]'}`}>
          Trocar
        </button>
      </div>

      {open && (
        <FronhaDialog
          options={options}
          value={value}
          one={one}
          defaultImage={defaultImage}
          onClose={() => setOpen(false)}
          onPick={async sku => { await onChange(sku); }}
        />
      )}
    </>
  );
}

function Thumb({ option, fallback, size }: { option?: FronhaOption; fallback?: string; size: number }) {
  const src = option?.image ?? (option ? undefined : fallback);
  return (
    <span className="relative block shrink-0 overflow-hidden rounded-xl bg-warm border border-mist" style={{ width: size, height: size }}>
      {src ? <Image src={src} alt="" fill sizes={`${size}px`} className="object-cover" />
        : option?.color ? <span className="absolute inset-0" style={{ background: option.color }} />
        : null}
    </span>
  );
}

function FronhaDialog({ options, value, one, defaultImage, onClose, onPick }: {
  options: FronhaOption[]; value: string | null; one: boolean; defaultImage?: string;
  onClose: () => void; onPick: (sku: string | null) => Promise<void>;
}) {
  // Estampa aberta em tamanho grande (lupa), antes de escolher.
  const [zoom, setZoom] = useState<FronhaOption | null>(null);
  const [saving, setSaving] = useState(false);
  const title = one ? 'Escolha a estampa da fronha' : 'Escolha a estampa das fronhas';

  return (
    <Overlay onClose={onClose} variant="responsive" label={title}
      className="bg-paper w-full sm:max-w-2xl sm:border sm:border-mist max-h-[92dvh] relative flex flex-col rounded-t-3xl sm:rounded-2xl overflow-hidden">
      {close => {
        const pick = async (sku: string | null) => {
          setSaving(true);
          try { await onPick(sku); } finally { setSaving(false); }
          close();
        };
        return (<>
          <div className="shrink-0 flex items-center justify-between gap-3 px-5 pt-5 pb-3">
            <div>
              <h2 className="font-display text-[1.45rem] text-ink leading-tight">{zoom ? zoom.label : title}</h2>
              {!zoom && <p className="text-[12.5px] text-mid mt-0.5">Sem custo. Toque na lupa para ver a estampa de perto.</p>}
            </div>
            <button type="button" onClick={zoom ? () => setZoom(null) : close} aria-label={zoom ? 'Voltar para as estampas' : 'Fechar'}
              className="shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-warm text-ink hover:bg-mist">
              {zoom
                ? <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
                : <IconX size={18} />}
            </button>
          </div>

          {zoom ? (
            <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5">
              <div className="relative w-full aspect-square overflow-hidden rounded-2xl bg-warm">
                {zoom.image
                  ? <Image src={zoom.image} alt={`Estampa ${zoom.label}`} fill sizes="(min-width: 640px) 640px, 100vw" className="object-contain" />
                  : <span className="absolute inset-0" style={{ background: zoom.color }} />}
              </div>
              <button type="button" disabled={!zoom.available || saving} onClick={() => pick(zoom.sku)}
                className="mt-4 w-full h-12 rounded-full bg-ink text-paper text-sm font-semibold hover:bg-clay transition-colors disabled:opacity-40">
                {!zoom.available ? 'Esgotada' : saving ? 'Trocando…' : value === zoom.sku ? 'Já escolhida' : 'Escolher esta estampa'}
              </button>
            </div>
          ) : (
            <div role="radiogroup" aria-label={title} className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 pt-1 grid grid-cols-2 sm:grid-cols-3 gap-3 content-start">
              <Tile label="A que vem no jogo" image={defaultImage} selected={value === null} available disabled={saving}
                onSelect={() => pick(null)} />
              {options.map(o => (
                <Tile key={o.sku} label={o.label} image={o.image} color={o.color} selected={value === o.sku}
                  available={o.available} disabled={saving}
                  onSelect={() => pick(o.sku)} onZoom={() => setZoom(o)} />
              ))}
            </div>
          )}
        </>);
      }}
    </Overlay>
  );
}

function Tile({ label, image, color, selected, available, disabled, onSelect, onZoom }: {
  label: string; image?: string; color?: string; selected: boolean; available: boolean; disabled?: boolean;
  onSelect: () => void; onZoom?: () => void;
}) {
  return (
    <div className="relative">
      <button type="button" role="radio" aria-checked={selected} disabled={!available || disabled} onClick={onSelect}
        aria-label={available ? label : `${label}, esgotada`}
        className="group block w-full text-left disabled:cursor-not-allowed">
        <span className={`relative block aspect-square overflow-hidden rounded-2xl bg-warm ring-2 ring-offset-2 ring-offset-paper transition-shadow ${selected ? 'ring-clay' : 'ring-transparent group-hover:ring-mist-d'} ${available ? '' : 'opacity-45 grayscale'}`}>
          {image ? <Image src={image} alt="" fill sizes="(min-width: 640px) 200px, 45vw" className="object-cover" />
            : color ? <span className="absolute inset-0" style={{ background: color }} /> : null}
          {selected && (
            <span aria-hidden="true" className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-clay text-paper shadow">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>
            </span>
          )}
          {!available && <span className="absolute inset-x-2 bottom-2 rounded-full bg-paper/90 py-1 text-center text-[11px] font-semibold text-mid">Esgotada</span>}
        </span>
        <span className={`mt-1.5 block text-[12.5px] leading-snug ${selected ? 'font-semibold text-ink' : 'text-mid'}`}>{label}</span>
      </button>
      {onZoom && (image || color) && (
        <button type="button" onClick={onZoom} aria-label={`Ver a estampa ${label} de perto`}
          className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-paper/90 text-ink shadow-sm hover:bg-paper">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2M11 8.5v5M8.5 11h5" /></svg>
        </button>
      )}
    </div>
  );
}

/**
 * Opções a partir das fronhas avulsas do catálogo. Várias fronhas têm o
 * mesmo nome de cor ("Estampado"): as repetidas ganham número, para dar
 * para dizer qual é qual (a foto mostra a diferença).
 */
export function fronhaOptionsFrom(
  fronhas: { id: string; name: string; images?: string[]; variants: { id: string; color?: string; colorName?: string }[] }[],
  freeStock: (sku: string) => number,
  pairsPerUnit: number,
): FronhaOption[] {
  const base = fronhas.flatMap(f => f.variants.slice(0, 1).map(v => ({
    sku: `${f.id}_${v.id}`,
    label: (v.colorName || f.name.replace(/^\s*(par\s+de\s+)?fronhas?\s*/i, '') || f.name).trim(),
    image: f.images?.[0],
    color: v.color,
    available: freeStock(`${f.id}_${v.id}`) >= pairsPerUnit,
  })));
  const total = new Map<string, number>();
  for (const o of base) total.set(o.label, (total.get(o.label) ?? 0) + 1);
  const seen = new Map<string, number>();
  return base.map(o => {
    if ((total.get(o.label) ?? 0) < 2) return o;
    const n = (seen.get(o.label) ?? 0) + 1;
    seen.set(o.label, n);
    return { ...o, label: `${o.label} ${n}` };
  });
}
