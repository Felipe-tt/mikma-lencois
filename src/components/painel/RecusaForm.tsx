'use client';

import { useState } from 'react';

/** Motivos prontos para recusar; o texto do vendedor completa (obrigatório). */
export const MOTIVOS_RECUSA = {
  comum: [
    'Fora do prazo de 7 dias',
    'Peças lavadas ou com sinais de uso',
    'Peça não é deste pedido',
    'Outro motivo',
  ],
  defeito: [
    'Fora do prazo de 90 dias',
    'Dano por uso ou lavagem, não de fabricação',
    'Não encontramos o defeito nas fotos',
    'Outro motivo',
  ],
} as const;

/**
 * Recusa com motivo: o vendedor escolhe o motivo e explica ao cliente (o
 * texto vai por e-mail e aparece no pedido). Antes um toque recusava sem
 * dizer nada ao cliente. O CDC exige informar o consumidor; no defeito
 * (art. 18), a recusa precisa de justificativa.
 */
export function RecusaForm({ defeito, onConfirm, onCancel, busy }: {
  defeito: boolean;
  onConfirm: (motivo: string) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [motivo, setMotivo] = useState('');
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState('');
  const opcoes = defeito ? MOTIVOS_RECUSA.defeito : MOTIVOS_RECUSA.comum;

  function confirmar() {
    if (!motivo) { setErro('Escolha o motivo da recusa.'); return; }
    if (texto.trim().length < 15) { setErro('Explique ao cliente em poucas palavras (pelo menos 15 letras).'); return; }
    onConfirm(motivo === 'Outro motivo' ? texto.trim() : `${motivo}. ${texto.trim()}`);
  }

  return (
    <div role="group" aria-label="Recusar troca" className="mt-1 rounded-xl border border-red-200 bg-red-50/60 p-4 flex flex-col gap-3">
      <p className="text-[13px] font-semibold text-ink">Por que a troca não pode ser feita?</p>
      <div role="radiogroup" aria-label="Motivo da recusa" className="flex flex-wrap gap-2">
        {opcoes.map(m => (
          <button key={m} type="button" role="radio" aria-checked={motivo === m} onClick={() => { setMotivo(m); setErro(''); }}
            className={`h-8 px-3 rounded-full border text-[12px] transition-colors ${motivo === m ? 'border-ink bg-ink text-paper font-semibold' : 'border-mist bg-paper text-ink hover:border-ink'}`}>
            {m}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-[12px] text-mid">Explique ao cliente (ele recebe por e-mail e vê no pedido)</span>
        <textarea value={texto} onChange={e => { setTexto(e.target.value); setErro(''); }} rows={3} maxLength={500}
          placeholder={defeito ? 'Ex.: nas fotos, o furo tem bordas desgastadas de uso, não é costura aberta.' : 'Ex.: o pedido foi entregue em 02/11 e o prazo de troca acabou em 09/11.'}
          className="rounded-xl border border-mist bg-paper px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-ink" />
      </label>
      {defeito && <p className="text-[11.5px] text-red-700">Defeito tem garantia de 90 dias (CDC art. 18): recuse só com justificativa clara. Na dúvida, aprove.</p>}
      {erro && <p role="alert" className="text-[12px] text-red-700">{erro}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={confirmar} disabled={busy}
          className="bg-red-600 text-white text-[11px] font-bold uppercase tracking-wide px-3.5 py-2 rounded-full hover:bg-red-700 disabled:opacity-50">
          {busy ? 'Recusando…' : 'Confirmar recusa'}
        </button>
        <button type="button" onClick={onCancel} disabled={busy}
          className="border border-mist text-mid text-[11px] font-bold uppercase tracking-wide px-3.5 py-2 rounded-full hover:bg-warm">
          Voltar
        </button>
      </div>
    </div>
  );
}
