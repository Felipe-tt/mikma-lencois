'use client';

/**
 * ConfirmDialog, substitui confirm(), alert() e prompt() nativos do navegador.
 *
 * DESIGN: singleton de módulo. Só um diálogo pode estar aberto por vez;
 * isso é intencional, todas as ações que precisam de confirmação são disparadas
 * por um clique do usuário (never em paralelo). Se duas chamadas concorrentes
 * acontecessem (improvável nesse caso de uso), a segunda sobrescreveria a primeira.
 *
 * USAGE (em qualquer componente/arquivo, sem hook):
 *   import { confirmDialog } from '@/components/ui/ConfirmDialog';
 *
 *   // Confirmação simples:
 *   const ok = await confirmDialog({ message: 'Tem certeza?' });
 *
 *   // Confirmação destrutiva (botão vermelho):
 *   const ok = await confirmDialog({ message: 'Apagar?', variant: 'danger', confirmLabel: 'Apagar' });
 *
 *   // Prompt com campo de texto:
 *   const { confirmed, value } = await confirmDialog({ message: 'Motivo:', withInput: true });
 *   if (!confirmed) return;
 *   console.log(value); // texto digitado
 *
 *   // Alert puro (sem botão cancelar):
 *   await confirmDialog({ message: 'Algo deu errado.', alertOnly: true });
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useOverlay } from '@/lib/hooks/useOverlay';

// ── Types ──────────────────────────────────────────────────────────────────────

export type ConfirmOptions = {
  /** Texto principal, a pergunta ou aviso */
  message: string;
  /** Subtexto opcional, menor, abaixo do message */
  detail?: string;
  /** Label do botão de confirmação (default: 'Confirmar') */
  confirmLabel?: string;
  /** Label do botão de cancelamento (default: 'Cancelar') */
  cancelLabel?: string;
  /**
   * 'default', botão de confirmar na cor da marca (#C4714A)
   * 'danger' , botão de confirmar vermelho (ações destrutivas/irreversíveis)
   */
  variant?: 'default' | 'danger';
  /** Se true, exibe um campo de texto; result.value terá o que foi digitado */
  withInput?: boolean;
  /** Placeholder do campo de texto (quando withInput=true) */
  inputPlaceholder?: string;
  /**
   * Se true, exibe apenas o botão "OK" sem opção de cancelar.
   * Equivale a um alert(), para avisos sem decisão.
   */
  alertOnly?: boolean;
};

type ConfirmResult = {
  confirmed: boolean;
  value?: string;
};

// ── Singleton de módulo ────────────────────────────────────────────────────────

type PendingDialog = {
  options: ConfirmOptions;
  resolve: (result: ConfirmResult) => void;
};

let pushPending: ((pending: PendingDialog) => void) | null = null;

/**
 * Abre o diálogo de confirmação e retorna uma Promise que resolve quando
 * o usuário clica em Confirmar/Cancelar ou pressiona Enter/Escape.
 */
export function confirmDialog(options: ConfirmOptions): Promise<ConfirmResult> {
  return new Promise(resolve => {
    if (!pushPending) {
      // ConfirmDialogHost ainda não montou (SSR ou fora do provider).
      // Fallback para o nativo como último recurso, nunca deve acontecer em produção.
      const ok = typeof window !== 'undefined' && window.confirm(options.message);
      resolve({ confirmed: !!ok });
      return;
    }
    pushPending({ options, resolve });
  });
}

// ── Host Component, monte uma única vez no Providers.tsx ─────────────────────

export function ConfirmDialogHost() {
  const [pending, setPending] = useState<PendingDialog | null>(null);
  // `open` separado de `pending`: ao fechar, o conteúdo continua na tela
  // durante a animação de saída em vez de sumir de uma vez.
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    pushPending = (p) => {
      setInputValue('');
      setPending(p);
      setOpen(true);
    };
    return () => { pushPending = null; };
  }, []);

  const hasInput = !!pending?.options.withInput;
  const { mounted, state } = useOverlay({
    open,
    onClose: () => resolve(false),
    panelRef,
    initialFocusRef: hasInput ? inputRef : confirmBtnRef,
    dismissible: !pending?.options.alertOnly,
  });

  // Enter confirma (exceto com campo de texto, que trata o próprio Enter)
  useEffect(() => {
    if (!open || hasInput) return;
    const onKey = (e: KeyboardEvent) => {
      // Enter num botão focado já dispara o clique dele (ex.: Cancelar).
      if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) resolve(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, hasInput, pending]); // eslint-disable-line react-hooks/exhaustive-deps

  function resolve(confirmed: boolean) {
    if (!pending || !open) return;
    const value = pending.options.withInput ? inputValue : undefined;
    pending.resolve({ confirmed, value });
    setOpen(false);
  }

  if (!pending || !mounted) return null;

  const {
    message, detail, confirmLabel, cancelLabel,
    variant = 'default', withInput, inputPlaceholder, alertOnly,
  } = pending.options;

  const confirmCls = variant === 'danger'
    ? 'bg-red-600 text-white hover:bg-red-700'
    : 'bg-clay text-paper hover:bg-clay-d';

  return createPortal(
    <div
      className="overlay-backdrop fixed inset-0 z-[200] flex items-center justify-center p-4"
      data-state={state}
      onClick={() => { if (!alertOnly) resolve(false); }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role={alertOnly ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby="confirm-dialog-message"
        aria-describedby={detail ? 'confirm-dialog-detail' : undefined}
        data-variant="dialog"
        className="overlay-panel bg-paper w-full max-w-[400px] shadow-2xl rounded-none overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header stripe */}
        <div className={`h-1 w-full ${variant === 'danger' ? 'bg-red-500' : 'bg-clay-l'}`} />

        {/* Content */}
        <div className="px-6 pt-5 pb-2">
          <p
            id="confirm-dialog-message"
            className="text-[14px] font-semibold text-ink leading-snug"
          >
            {message}
          </p>
          {detail && (
            <p id="confirm-dialog-detail" className="mt-1.5 text-[12px] text-mid leading-relaxed">{detail}</p>
          )}

          {withInput && (
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              placeholder={inputPlaceholder ?? ''}
              onKeyDown={e => { if (e.key === 'Enter') resolve(true); }}
              className="mt-4 w-full border border-mist bg-white dark:bg-warm px-3 py-2.5 text-[13px] outline-none focus:border-clay focus:ring-2 focus:ring-clay/20 transition-[border-color,box-shadow] duration-150 placeholder:text-faint"
            />
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end px-6 py-5 gap-2.5">
          {!alertOnly && (
            <button
              type="button"
              onClick={() => resolve(false)}
              className="px-4 py-2 text-[12px] font-semibold text-mid border border-mist hover:bg-warm hover:text-ink active:scale-[0.97] transition-[background-color,color,transform] duration-150"
            >
              {cancelLabel ?? 'Cancelar'}
            </button>
          )}
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={() => resolve(true)}
            className={`px-4 py-2 text-[12px] font-semibold active:scale-[0.97] transition-[background-color,transform] duration-150 ${confirmCls}`}
          >
            {confirmLabel ?? (alertOnly ? 'OK' : 'Confirmar')}
          </button>
        </div>
      </div>

    </div>,
    document.body
  );
}
