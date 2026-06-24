'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  collection, query, orderBy, onSnapshot, doc, updateDoc,
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase/client';
import { formatTsDateTime } from '@/lib/utils/format';
import type { Conversation, EmailMessage, EmailAttachment } from '@/types';
import { DashboardSkeleton } from '@/components/ui/Skeleton';
import DOMPurify from 'dompurify';

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

  const selected = useMemo(() => conversations.find(c => c.id === selectedId) ?? null, [conversations, selectedId]);

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
        <p className="text-[13px] text-[#B09C8C] mt-1">Converse com seus clientes direto por aqui, sem sair do painel.</p>
      </div>

      <div className="bg-[#FAF8F5] border border-[#E6DFD5] flex h-[calc(100vh-220px)] min-h-[420px] overflow-hidden">
        {/* Lista de conversas */}
        <div className={`w-full sm:w-[320px] shrink-0 border-r border-[#E6DFD5] overflow-y-auto ${selected ? 'hidden sm:block' : ''}`}>
          {conversations.length === 0 ? (
            <div className="py-16 text-center px-6">
              <p className="text-4xl mb-3">✉️</p>
              <p className="text-sm text-[#B09C8C]">Nenhuma mensagem ainda.</p>
              <p className="text-[11px] text-[#B09C8C] mt-1">Quando um cliente escrever pra contato@mikma.com.br, a conversa aparece aqui.</p>
            </div>
          ) : (
            conversations.map(conv => (
              <button
                key={conv.id}
                onClick={() => openConversation(conv)}
                className={`w-full text-left px-4 py-3.5 border-b border-[#E6DFD5] transition-colors ${
                  selectedId === conv.id ? 'bg-[#1E1208] text-[#FAF8F5]' : 'hover:bg-[#F0EBE1]'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className={`text-[13px] font-semibold truncate ${selectedId === conv.id ? 'text-[#FAF8F5]' : 'text-[#1E1208]'}`}>
                    {conv.customerName || conv.customerEmail}
                  </span>
                  {conv.unread && (
                    <span className="shrink-0 w-2 h-2 rounded-full bg-[#C4714A]" aria-label="Não lida" />
                  )}
                </div>
                <p className={`text-[12px] truncate ${selectedId === conv.id ? 'text-[#FAF8F5]/60' : 'text-[#B09C8C]'}`}>
                  {conv.lastMessagePreview || '—'}
                </p>
                <p className={`text-[10px] mt-1 ${selectedId === conv.id ? 'text-[#FAF8F5]/40' : 'text-[#B09C8C]/70'}`}>
                  {formatTsDateTime(conv.lastMessageAt)}
                </p>
              </button>
            ))
          )}
        </div>

        {/* Thread */}
        <div className={`flex-1 flex flex-col ${selected ? '' : 'hidden sm:flex'}`}>
          {selected ? (
            <ConversationThread conversation={selected} onBack={() => setSelectedId(null)} />
          ) : (
            <div className="flex-1 flex items-center justify-center text-center px-6">
              <p className="text-sm text-[#B09C8C]">Selecione uma conversa para ver as mensagens.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConversationThread({ conversation, onBack }: { conversation: Conversation; onBack: () => void }) {
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    return onSnapshot(
      query(collection(db, 'conversations', conversation.id, 'messages'), orderBy('createdAt', 'asc')),
      snap => {
        setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as EmailMessage)));
        setLoading(false);
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
        body: JSON.stringify({ conversationId: conversation.id, text }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || 'Erro ao enviar');
      }
      setReply('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar a resposta. Tente novamente.');
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

  return (
    <div className="flex flex-col h-full">
      {/* Header da thread */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E6DFD5] shrink-0">
        <button onClick={onBack} className="sm:hidden text-[#705A48] hover:text-[#1E1208]" aria-label="Voltar para a lista">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M12 19l-7-7 7-7" /></svg>
        </button>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[#1E1208] truncate">{conversation.customerName || conversation.customerEmail}</p>
          {conversation.customerName && <p className="text-[11px] text-[#B09C8C] truncate">{conversation.customerEmail}</p>}
        </div>
      </div>

      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {loading ? (
          <p className="text-[12px] text-[#B09C8C] text-center mt-8">Carregando mensagens…</p>
        ) : messages.length === 0 ? (
          <p className="text-[12px] text-[#B09C8C] text-center mt-8">Nenhuma mensagem nesta conversa.</p>
        ) : (
          messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)
        )}
      </div>

      {/* Campo de resposta */}
      <div className="border-t border-[#E6DFD5] p-3 shrink-0">
        {error && <p className="text-[12px] text-red-500 mb-2">{error}</p>}
        <div className="flex items-end gap-2">
          <textarea
            value={reply}
            onChange={e => setReply(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escreva sua resposta…"
            rows={2}
            className="flex-1 resize-none border border-[#E6DFD5] bg-white px-3 py-2 text-[13px] text-[#1E1208] focus:outline-none focus:ring-2 focus:ring-[#C4714A]/20 focus:border-[#C4714A]/60"
          />
          <button
            onClick={handleSend}
            disabled={!reply.trim() || sending}
            className="shrink-0 px-4 py-2.5 text-[12px] font-bold uppercase tracking-wide bg-[#C4714A] text-white hover:bg-[#A05432] transition-colors disabled:opacity-40"
          >
            {sending ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
        <p className="text-[10px] text-[#B09C8C] mt-1.5">Ctrl+Enter (ou ⌘+Enter) para enviar rápido.</p>
      </div>
    </div>
  );
}

type FullEmailMessage = EmailMessage;

// Mesma allowlist usada no servidor (api/email/inbound) — sanitizar de novo
// aqui é defesa em profundidade: protege mesmo que dados não sanitizados
// cheguem ao Firestore por outro caminho no futuro (bug, migração, etc).
// Esse HTML tem origem em e-mails de terceiros, então nunca é confiável.
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'span', 'div',
    'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'table', 'thead', 'tbody', 'tr', 'td', 'th',
    'a', 'img',
  ],
  ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'src', 'alt', 'width', 'height', 'style'],
  ALLOWED_URI_REGEXP: /^(?:https?|mailto|data):/i,
};

function MessageBubble({ msg }: { msg: FullEmailMessage }) {
  const isOut = msg.direction === 'outbound';
  const attachments: EmailAttachment[] = msg.attachments ?? [];
  const imageAttachments = attachments.filter(a => a.isImage);
  const fileAttachments = attachments.filter(a => !a.isImage);
  const safeHtml = useMemo(
    () => (msg.html ? DOMPurify.sanitize(msg.html, SANITIZE_CONFIG) : ''),
    [msg.html]
  );

  return (
    <div className={`max-w-[85%] flex flex-col gap-1.5 ${isOut ? 'self-end items-end' : 'self-start items-start'}`}>
      {/* Assunto apenas para mensagens inbound */}
      {!isOut && msg.subject && (
        <p className="text-[10px] font-semibold text-[#B09C8C] uppercase tracking-wide px-1">
          {msg.subject}
        </p>
      )}

      {/* Corpo da mensagem */}
      <div className={`text-[13px] leading-relaxed ${isOut ? 'bg-[#1E1208] text-[#FAF8F5] px-3.5 py-2.5' : 'bg-[#F0EBE1] text-[#1E1208] border border-[#E6DFD5] px-3.5 py-2.5'}`}>
        {safeHtml ? (
          <div
            className="email-html-body"
            style={{ fontSize: 13, lineHeight: 1.5, wordBreak: 'break-word', maxWidth: '100%', overflowX: 'auto' }}
            dangerouslySetInnerHTML={{ __html: safeHtml }}
          />
        ) : (
          <p className="whitespace-pre-wrap">{msg.text}</p>
        )}
      </div>

      {/* Imagens inline */}
      {imageAttachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-0.5">
          {imageAttachments.map((att, i) => (
            <a key={i} href={att.url} target="_blank" rel="noopener noreferrer">
              <img
                src={att.url}
                alt={att.filename}
                className="max-w-[220px] max-h-[180px] object-cover border border-[#E6DFD5] hover:opacity-90 transition-opacity"
              />
            </a>
          ))}
        </div>
      )}

      {/* Outros anexos */}
      {fileAttachments.length > 0 && (
        <div className="flex flex-col gap-1 mt-0.5 w-full">
          {fileAttachments.map((att, i) => (
            <a
              key={i}
              href={att.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 border border-[#E6DFD5] bg-white hover:bg-[#F0EBE1] transition-colors text-[12px] text-[#705A48] font-medium"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              {att.filename}
            </a>
          ))}
        </div>
      )}

      <span className="text-[10px] text-[#B09C8C]">{formatTsDateTime(msg.createdAt)}</span>
    </div>
  );
}
