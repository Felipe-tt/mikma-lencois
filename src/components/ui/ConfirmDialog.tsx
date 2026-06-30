'use client';

/**
 * ConfirmDialog — substitui confirm(), alert() e prompt() nativos do navegador.
 *
 * DESIGN: singleton de módulo. Só um diálogo pode estar aberto por vez;
 * isso é intencional — todas as ações que precisam de confirmação são disparadas
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

// ── Types ──────────────────────────────────────────────────────────────────────

export type ConfirmOptions = {
  /** Texto principal — a pergunta ou aviso */
  message: string;
  /** Subtexto opcional, menor, abaixo do message */
  detail?: string;
  /** Label do botão de confirmação (default: 'Confirmar') */
  confirmLabel?: string;
  /** Label do botão de cancelamento (default: 'Cancelar') */
  cancelLabel?: string;
  /**
   * 'default' — botão de confirmar na cor da marca (#C4714A)
   * 'danger'  — botão de confirmar vermelho (ações destrutivas/irreversíveis)
   */
  variant?: 'default' | 'danger';
  /** Se true, exibe um campo de texto; result.value terá o que foi digitado */
  withInput?: boolean;
  /** Placeholder do campo de texto (quando withInput=true) */
  inputPlaceholder?: string;
  /**
   * Se true, exibe apenas o botão "OK" sem opção de cancelar.
   * Equivale a um alert() — para avisos sem decisão.
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
      // Fallback para o nativo como último recurso — nunca deve acontecer em produção.
      const ok = typeof window !== 'undefined' && window.confirm(options.message);
      resolve({ confirmed: !!ok });
      return;
    }
    pushPending({ options, resolve });
  });
}

// ── Host Component — monte uma única vez no Providers.tsx ─────────────────────

export function ConfirmDialogHost() {
  const [pending, setPending] = useState<PendingDialog | null>(null);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    pushPending = (p) => {
      setInputValue('');
      setPending(p);
    };
    return () => { pushPending = null; };
  }, []);

  // Foca o campo de texto (withInput) ou o botão de confirmar ao abrir
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => {
      if (pending.options.withInput) {
        inputRef.current?.focus();
      } else {
        confirmBtnRef.current?.focus();
      }
    }, 60); // aguarda a animação de entrada
    return () => clearTimeout(timer);
  }, [pending]);

  // Trava scroll do body enquanto aberto
  useEffect(() => {
    if (!pending) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [pending]);

  // Escape fecha/cancela
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!pending.options.alertOnly) resolve(false);
      }
      if (e.key === 'Enter' && !pending.options.withInput) {
        resolve(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending]); // eslint-disable-line react-hooks/exhaustive-deps

  function resolve(confirmed: boolean) {
    if (!pending) return;
    const value = pending.options.withInput ? inputValue : undefined;
    pending.resolve({ confirmed, value });
    setPending(null);
  }

  if (!pending) return null;

  const {
    message, detail, confirmLabel, cancelLabel,
    variant = 'default', withInput, inputPlaceholder, alertOnly,
  } = pending.options;

  const confirmCls = variant === 'danger'
    ? 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-300'
    : 'bg-[#C4714A] text-white hover:bg-[#A8593A] focus:ring-[#C4714A]/40';

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-[rgba(30,18,8,0.55)] backdrop-blur-[2px]"
      onClick={() => { if (!alertOnly) resolve(false); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-message"
    >
      <div
        className="bg-[#FAF8F5] w-full max-w-[400px] shadow-2xl animate-confirm-in rounded-none overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header stripe */}
        <div className={`h-1 w-full ${variant === 'danger' ? 'bg-red-500' : 'bg-[#C4714A]'}`} />

        {/* Content */}
        <div className="px-6 pt-5 pb-2">
          <p
            id="confirm-dialog-message"
            className="text-[14px] font-semibold text-[#1E1208] leading-snug"
          >
            {message}
          </p>
          {detail && (
            <p className="mt-1.5 text-[12px] text-[#705A48] leading-relaxed">{detail}</p>
          )}

          {withInput && (
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              placeholder={inputPlaceholder ?? ''}
              onKeyDown={e => { if (e.key === 'Enter') resolve(true); }}
              className="mt-4 w-full border border-[#E6DFD5] bg-white px-3 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#C4714A]/25 placeholder:text-[#C8BAB0]"
            />
          )}
        </div>

        {/* Actions */}
        <div className={`flex items-center px-6 py-5 gap-2.5 ${alertOnly ? 'justify-end' : 'justify-end'}`}>
          {!alertOnly && (
            <button
              type="button"
              onClick={() => resolve(false)}
              className="px-4 py-2 text-[12px] font-semibold text-[#705A48] border border-[#E6DFD5] hover:bg-[#F0EBE1] transition-colors focus:outline-none focus:ring-2 focus:ring-[#E6DFD5]"
            >
              {cancelLabel ?? 'Cancelar'}
            </button>
          )}
          <button
            ref={confirmBtnRef}
            type="button"
            onClick={() => resolve(true)}
            className={`px-4 py-2 text-[12px] font-semibold transition-colors focus:outline-none focus:ring-2 ${confirmCls}`}
          >
            {confirmLabel ?? (alertOnly ? 'OK' : 'Confirmar')}
          </button>
        </div>
      </div>

    </div>,
    document.body
  );
}
