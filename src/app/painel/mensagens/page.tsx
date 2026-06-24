'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase/client';
import { formatTsDateTime } from '@/lib/utils/format';
import type { EmailMessage, EmailAttachment, Conversation } from '@/types';
import { DashboardSkeleton } from '@/components/ui/Skeleton';

export default function PainelMensagens() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'conversations'), orderBy('lastMessageAt', 'desc')),
      snap => {
        setConversations(snap.docs.map(d => ({ id: d.id, ...d.data() } as Conversation)));
        setLoading(false);
      }
    );
  }, []);

  const selected = useMemo(
    () => conversations.find(c => c.id === selectedId) ?? null,
    [conversations, selectedId]
  );

  async function openConversation(conv: Conversation) {
    setSelectedId(conv.id);
    if (conv.unread) {
      await updateDoc(doc(db, 'conversations', conv.id), { unread: false });
    }
  }

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="font-display font-normal text-[#1E1208] text-2xl">Mensagens</h1>
        <p className="text-[13px] text-[#B09C8C] mt-1">
          Responda e-mails de clientes direto pelo painel. As respostas chegam com o visual da loja.
        </p>
      </div>

      <div className="bg-[#FAF8F5] border border-[#E6DFD5] flex h-[calc(100vh-220px)] min-h-[500px] overflow-hidden">
        {/* ── Lista de conversas ── */}
        <div className={`w-full sm:w-[300px] shrink-0 border-r border-[#E6DFD5] flex flex-col overflow-hidden ${selected ? 'hidden sm:flex' : ''}`}>
          <div className="px-4 py-3 border-b border-[#E6DFD5] bg-[#F0EAE1] shrink-0">
            <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#B09C8C]">
              {conversations.length} conversa{conversations.length !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="overflow-y-auto flex-1">
            {conversations.length === 0 ? (
              <div className="py-16 text-center px-6">
                <p className="text-4xl mb-3">✉️</p>
                <p className="text-[13px] font-semibold text-[#1E1208] mb-1">Nenhuma mensagem ainda</p>
                <p className="text-[12px] text-[#B09C8C]">
                  Quando alguém escrever para contato@mikma.com.br, a conversa aparece aqui.
                </p>
              </div>
            ) : conversations.map(conv => (
              <button
                key={conv.id}
                onClick={() => openConversation(conv)}
                className={`w-full text-left px-4 py-3.5 border-b border-[#E6DFD5] transition-colors ${
                  selectedId === conv.id
                    ? 'bg-[#1E1208] text-[#FAF8F5]'
                    : 'hover:bg-[#F0EBE1]'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {/* Avatar inicial */}
                  <div className={`w-6 h-6 flex items-center justify-center text-[10px] font-bold shrink-0 ${
                    selectedId === conv.id ? 'bg-[#FAF8F5]/20 text-[#FAF8F5]' : 'bg-[#E6DFD5] text-[#705A48]'
                  }`}>
                    {(conv.customerName || conv.customerEmail)[0].toUpperCase()}
                  </div>
                  <span className={`text-[13px] font-semibold truncate flex-1 ${
                    selectedId === conv.id ? 'text-[#FAF8F5]' : 'text-[#1E1208]'
                  }`}>
                    {conv.customerName || conv.customerEmail}
                  </span>
                  {conv.unread && (
                    <span className="shrink-0 w-2 h-2 rounded-full bg-[#C4714A]" />
                  )}
                </div>
                <p className={`text-[11px] truncate pl-8 ${
                  selectedId === conv.id ? 'text-[#FAF8F5]/60' : 'text-[#B09C8C]'
                }`}>
                  {conv.lastMessagePreview || '—'}
                </p>
                <p className={`text-[10px] mt-1 pl-8 ${
                  selectedId === conv.id ? 'text-[#FAF8F5]/40' : 'text-[#B09C8C]/60'
                }`}>
                  {formatTsDateTime(conv.lastMessageAt)}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* ── Thread ── */}
        <div className={`flex-1 flex flex-col overflow-hidden ${selected ? '' : 'hidden sm:flex'}`}>
          {selected ? (
            <ConversationThread conversation={selected} onBack={() => setSelectedId(null)} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-3">
              <p className="text-3xl">💬</p>
              <p className="text-[14px] font-semibold text-[#1E1208]">Selecione uma conversa</p>
              <p className="text-[12px] text-[#B09C8C]">As mensagens aparecem aqui.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Thread component ────────────────────────────────────────────────────── */

function ConversationThread({
  conversation,
  onBack,
}: {
  conversation: Conversation;
  onBack: () => void;
}) {
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [subject, setSubject] = useState('');
  const [showSubject, setShowSubject] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    setReply('');
    setError('');
    setShowPreview(false);
    return onSnapshot(
      query(
        collection(db, 'conversations', conversation.id, 'messages'),
        orderBy('createdAt', 'asc')
      ),
      snap => {
        const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() } as EmailMessage));
        setMessages(msgs);
        setLoading(false);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
      }
    );
  }, [conversation.id]);

  async function handleSend() {
    const text = reply.trim();
    if (!text || sending) return;
    setSending(true);
    setError('');
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          conversationId: conversation.id,
          text,
          ...(subject.trim() ? { subject: subject.trim() } : {}),
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || 'Erro ao enviar');
      }
      setReply('');
      setSubject('');
      setShowSubject(false);
      setShowPreview(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar. Tente novamente.');
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  }

  // Gera preview HTML igual ao template do servidor
  function previewHtml(text: string): string {
    const bodyHtml = text
      .split(/\n\n+/)
      .map(p => `<p style="margin:0 0 14px;line-height:1.65;">${p.replace(/\n/g, '<br>')}</p>`)
      .join('');
    return `<div style="font-family:Helvetica,Arial,sans-serif;background:#F5F0EB;padding:24px 16px;">
      <div style="max-width:560px;margin:0 auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:16px;">
          <span style="font-family:Georgia,serif;font-size:18px;color:#1E1208;">Mikma Lençóis</span>
          <span style="font-size:10px;color:#9C8B7C;letter-spacing:.1em;text-transform:uppercase;">Blumenau, SC</span>
        </div>
        <div style="background:#fff;padding:28px 28px 20px;border-top:3px solid #C4714A;">
          <div style="font-size:14px;color:#2C1F14;">${bodyHtml}</div>
        </div>
        <div style="background:#fff;padding:0 28px 24px;">
          <div style="border-top:1px solid #EDE6DC;padding-top:16px;display:flex;justify-content:space-between;align-items:flex-start;">
            <div style="font-size:12px;color:#705A48;line-height:1.6;">
              <strong style="color:#1E1208;">Mikma Lençóis</strong><br>
              contato@mikma.com.br<br>
              <span style="color:#C4714A;">mikma.com.br</span>
            </div>
            <span style="font-family:Georgia,serif;font-size:26px;color:#E6DFD5;font-style:italic;">M</span>
          </div>
        </div>
      </div>
    </div>`;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E6DFD5] bg-[#FAF8F5] shrink-0">
        <button
          onClick={onBack}
          className="sm:hidden text-[#705A48] hover:text-[#1E1208] transition-colors p-1 -ml-1"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Avatar */}
        <div className="w-8 h-8 bg-[#E6DFD5] flex items-center justify-center text-[13px] font-bold text-[#705A48] shrink-0">
          {(conversation.customerName || conversation.customerEmail)[0].toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-[#1E1208] leading-tight truncate">
            {conversation.customerName || conversation.customerEmail}
          </p>
          {conversation.customerName && (
            <p className="text-[11px] text-[#B09C8C] truncate">{conversation.customerEmail}</p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-[#B09C8C]">
            {messages.length} msg{messages.length !== 1 ? 's' : ''}
          </span>
          <a
            href={`mailto:${conversation.customerEmail}`}
            className="text-[11px] font-semibold text-[#C4714A] hover:text-[#A05432] transition-colors"
          >
            Abrir no e-mail
          </a>
        </div>
      </div>

      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-4">
        {loading ? (
          <p className="text-[12px] text-[#B09C8C] text-center mt-8">Carregando mensagens…</p>
        ) : messages.length === 0 ? (
          <p className="text-[12px] text-[#B09C8C] text-center mt-8">Nenhuma mensagem nesta conversa.</p>
        ) : (
          messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)
        )}
        <div ref={bottomRef} />
      </div>

      {/* Área de resposta */}
      <div className="border-t border-[#E6DFD5] bg-[#FAF8F5] shrink-0">

        {/* Preview do e-mail */}
        {showPreview && reply.trim() && (
          <div className="border-b border-[#E6DFD5] max-h-[280px] overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-2 bg-[#F0EAE1]">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#B09C8C]">
                Preview — como o cliente vai receber
              </p>
              <button onClick={() => setShowPreview(false)} className="text-[11px] text-[#B09C8C] hover:text-[#1E1208]">
                Fechar
              </button>
            </div>
            <div
              className="pointer-events-none"
              dangerouslySetInnerHTML={{ __html: previewHtml(reply) }}
            />
          </div>
        )}

        <div className="p-3 flex flex-col gap-2">
          {error && (
            <p className="text-[12px] text-red-500 font-medium">⚠️ {error}</p>
          )}

          {/* Assunto (opcional, expansível) */}
          {showSubject ? (
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold uppercase tracking-wide text-[#B09C8C] shrink-0">Assunto</label>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Re: contato Mikma Lençóis"
                className="flex-1 border border-[#E6DFD5] bg-white px-2.5 py-1.5 text-[12px] text-[#1E1208] focus:outline-none focus:ring-2 focus:ring-[#C4714A]/20 focus:border-[#C4714A]/60"
              />
              <button onClick={() => { setShowSubject(false); setSubject(''); }} className="text-[10px] text-[#B09C8C] hover:text-[#1E1208]">
                Remover
              </button>
            </div>
          ) : null}

          {/* Textarea */}
          <textarea
            value={reply}
            onChange={e => setReply(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escreva sua resposta… (Ctrl+Enter para enviar)"
            rows={3}
            className="w-full resize-none border border-[#E6DFD5] bg-white px-3 py-2.5 text-[13px] text-[#1E1208] focus:outline-none focus:ring-2 focus:ring-[#C4714A]/20 focus:border-[#C4714A]/60 placeholder:text-[#C8BAB0]"
          />

          {/* Barra de ações */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              {!showSubject && (
                <button
                  onClick={() => setShowSubject(true)}
                  className="text-[11px] text-[#B09C8C] hover:text-[#705A48] transition-colors"
                >
                  + Assunto
                </button>
              )}
              {reply.trim() && (
                <button
                  onClick={() => setShowPreview(v => !v)}
                  className="text-[11px] text-[#B09C8C] hover:text-[#705A48] transition-colors"
                >
                  {showPreview ? 'Ocultar preview' : 'Ver como vai ficar'}
                </button>
              )}
            </div>

            <button
              onClick={handleSend}
              disabled={!reply.trim() || sending}
              className="flex items-center gap-2 px-5 py-2.5 text-[12px] font-bold uppercase tracking-wide bg-[#C4714A] text-white hover:bg-[#A05432] transition-colors disabled:opacity-40"
            >
              {sending ? (
                <>
                  <span className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />
                  Enviando…
                </>
              ) : 'Enviar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Bubble ──────────────────────────────────────────────────────────────── */

function MessageBubble({ msg }: { msg: EmailMessage }) {
  const isOut = msg.direction === 'outbound';
  const attachments: EmailAttachment[] = (msg.attachments as EmailAttachment[] | undefined) ?? [];
  const images = attachments.filter(a => a.isImage);
  const files = attachments.filter(a => !a.isImage);

  return (
    <div className={`flex flex-col gap-1.5 max-w-[88%] ${isOut ? 'self-end items-end' : 'self-start items-start'}`}>

      {/* Assunto (só inbound) */}
      {!isOut && (msg as { subject?: string }).subject && (
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#B09C8C] px-1">
          {(msg as { subject?: string }).subject}
        </p>
      )}

      {/* Corpo */}
      <div className={`text-[13px] leading-relaxed ${
        isOut
          ? 'bg-[#1E1208] text-[#FAF8F5] px-4 py-3 rounded-tl rounded-bl'
          : 'bg-white border border-[#E6DFD5] text-[#1E1208] px-4 py-3 rounded-tr rounded-br'
      }`}>
        {(msg as { html?: string }).html ? (
          <div
            className="email-html-body"
            style={{ fontSize: 13, lineHeight: 1.6, wordBreak: 'break-word', overflowX: 'auto' }}
            dangerouslySetInnerHTML={{ __html: (msg as { html?: string }).html! }}
          />
        ) : (
          <p className="whitespace-pre-wrap">{msg.text}</p>
        )}
      </div>

      {/* Imagens */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((att, i) => (
            <a key={i} href={att.url} target="_blank" rel="noopener noreferrer">
              <img
                src={att.url}
                alt={att.filename}
                className="max-w-[200px] max-h-[160px] object-cover border border-[#E6DFD5] hover:opacity-90 transition-opacity"
              />
            </a>
          ))}
        </div>
      )}

      {/* Outros arquivos */}
      {files.length > 0 && (
        <div className="flex flex-col gap-1 w-full">
          {files.map((att, i) => (
            <a
              key={i}
              href={att.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 border border-[#E6DFD5] bg-white hover:bg-[#F0EBE1] transition-colors text-[12px] text-[#705A48] font-medium"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
              {att.filename}
            </a>
          ))}
        </div>
      )}

      <span className="text-[10px] text-[#B09C8C]">{formatTsDateTime(msg.createdAt)}</span>
    </div>
  );
}
