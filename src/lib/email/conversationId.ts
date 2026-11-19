/** ID da conversa do atendimento por e-mail: o próprio e-mail do cliente, normalizado. */
export function conversationIdFor(email: string): string {
  return email.toLowerCase().replace(/[^a-z0-9.@_-]/g, '_');
}
