/**
 * Remetente de e-mail recebido ("Nome <email@x.com>"). Sem regex: o cabeçalho
 * vem de qualquer pessoa, e /<([^>]+)>/ leva tempo quadrático com uma
 * sequência longa de "<" sem ">" (alerta do CodeQL).
 */
const MAX = 1000;

/** O endereço, em minúsculas: o que está entre < e >, ou o texto todo. */
export function emailFromHeader(raw: string): string {
  const s = raw.slice(0, MAX);
  const open = s.lastIndexOf('<');
  const close = open >= 0 ? s.indexOf('>', open + 1) : -1;
  return (close > open + 1 ? s.slice(open + 1, close) : s).trim().toLowerCase();
}

/** O nome antes do "<", sem aspas; undefined quando não há. */
export function nameFromHeader(raw: string): string | undefined {
  const s = raw.slice(0, MAX);
  const open = s.indexOf('<');
  if (open <= 0) return undefined;
  let name = s.slice(0, open).trim();
  if (name.startsWith('"')) name = name.slice(1);
  if (name.endsWith('"')) name = name.slice(0, -1);
  return name.trim() || undefined;
}
