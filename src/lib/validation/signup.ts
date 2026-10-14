/**
 * Validação do cadastro que roda no navegador e no servidor.
 * Sintaxe de e-mail, telefone e CPF vêm de bibliotecas mantidas
 * (validator, libphonenumber-js, brazilian-utils), nao de regex proprio.
 * Senha fica em ./password (async, usa zxcvbn e Have I Been Pwned).
 * Checagem de entregabilidade do e-mail fica em ./emailDeliverability (so servidor).
 */
import isEmail from 'validator/lib/isEmail';
import emailSpellChecker, { POPULAR_DOMAINS, POPULAR_TLDS } from '@zootools/email-spell-checker';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { isValidCpf as isValidCpfLib, isValidPhone as isValidBrPhone } from '@brazilian-utils/brazilian-utils';

export type FieldResult = { ok: true; value: string } | { ok: false; error: string };

const ok = (value: string): FieldResult => ({ ok: true, value });
const fail = (error: string): FieldResult => ({ ok: false, error });

// ── Nome ────────────────────────────────────────────────────────────────────
//
// Nao existe biblioteca padrao para validar nomes: nomes reais violam quase
// toda regra "esperta" (W3C, "Falsehoods programmers believe about names").
// A pratica recomendada e: normalizar Unicode (NFC), aceitar letras e marcas
// de qualquer alfabeto, barrar controle, digitos e simbolos, e limitar o
// tamanho em graphemes. Exigimos nome e sobrenome porque a nota fiscal e a
// entrega precisam do nome completo.

export const NAME_MAX = 100;

const NAME_ALLOWED = /^[\p{L}\p{M}]+(?:[\p{L}\p{M}'’.\- ]*[\p{L}\p{M}.])?$/u;
const NAME_STRIP = /[^\p{L}\p{M}'’.\- ]/gu;

function graphemeLength(s: string): number {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    let n = 0;
    for (const _ of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)) n++;
    return n;
  }
  return [...s].length;
}

/** Usado ao digitar: remove digitos, simbolos, emojis e caracteres de controle. */
export function stripNameChars(raw: string): string {
  return raw.normalize('NFC').replace(NAME_STRIP, '').replace(/ {2,}/g, ' ').replace(/^ +/, '');
}

export function validateName(raw: string): FieldResult {
  const input = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!input) return fail('Informe seu nome completo.');
  if (graphemeLength(input) > NAME_MAX) return fail(`O nome pode ter no máximo ${NAME_MAX} caracteres.`);
  if (!NAME_ALLOWED.test(input)) return fail('O nome deve ter apenas letras. Não use números ou símbolos.');
  const lettersOnly = (s: string) => s.replace(/[^\p{L}]/gu, '');
  // Nomes em chines, japones e coreano podem ter sobrenome de 1 caractere.
  const isCjk = (s: string) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(s);
  const longEnough = (part: string) => lettersOnly(part).length >= (isCjk(part) ? 1 : 2);
  const parts = input.split(' ');
  if (parts.length < 2 || !longEnough(parts[0]) || !longEnough(parts[parts.length - 1])) {
    return fail('Informe nome e sobrenome.');
  }
  if (/(\p{L})\1{3,}/iu.test(input)) return fail('Esse nome não parece válido.');
  return ok(input);
}

// ── E-mail (sintaxe) ────────────────────────────────────────────────────────

export const EMAIL_MAX = 254;

export function normalizeEmail(raw: string): string {
  return raw.normalize('NFKC').trim().toLowerCase();
}

export function validateEmail(raw: string): FieldResult {
  const email = normalizeEmail(raw);
  if (!email) return fail('Informe seu e-mail.');
  if (email.length > EMAIL_MAX) return fail('E-mail muito longo.');
  const valid = isEmail(email, {
    allow_utf8_local_part: false,
    allow_ip_domain: false,
    allow_display_name: false,
    require_tld: true,
    ignore_max_length: false,
    domain_specific_validation: false,
  });
  // TLD so com letras (barra "a@b.123") e dominio com ponto
  const tld = email.split('@')[1]?.split('.').pop() ?? '';
  if (!valid || !/^[a-z]{2,24}$/.test(tld)) return fail('Informe um e-mail válido, como nome@exemplo.com.');
  return ok(email);
}

const BR_DOMAINS = [
  'uol.com', 'uol.com.br', 'bol.com.br', 'terra.com.br', 'ig.com.br', 'globo.com', 'r7.com',
  'live.com', 'msn.com', 'proton.me', 'protonmail.com', 'icloud.com', 'me.com',
];
const BR_TLDS = ['com.br', 'net.br', 'org.br', 'gov.br', 'edu.br', 'br'];

/** Sugere correcao de erro de digitacao (gmial.com), ou null se estiver ok. */
export function suggestEmailFix(raw: string): string | null {
  const email = normalizeEmail(raw);
  if (!email.includes('@')) return null;
  const hit = emailSpellChecker.run({
    email,
    domains: [...POPULAR_DOMAINS, ...BR_DOMAINS],
    topLevelDomains: [...POPULAR_TLDS, ...BR_TLDS],
  });
  return hit && hit.full !== email ? hit.full : null;
}

// ── Telefone e CPF (opcionais) ───────────────────────────────────────────────

/**
 * Telefone brasileiro: libphonenumber (plano de numeracao) mais a lista oficial
 * de DDDs do brazilian-utils (o libphonenumber aceita DDDs que nao existem).
 * Retorna so os digitos nacionais.
 */
export function validatePhone(raw: string): FieldResult {
  if (!raw.trim()) return ok('');
  const parsed = parsePhoneNumberFromString(raw, 'BR');
  if (!parsed || parsed.country !== 'BR' || !parsed.isValid() || !isValidBrPhone(parsed.nationalNumber)) return fail('Telefone inválido. Use DDD + número.');
  return ok(parsed.nationalNumber);
}

export function validateCpf(raw: string): FieldResult {
  const d = raw.replace(/\D/g, '');
  if (!d) return ok('');
  if (!isValidCpfLib(d)) return fail('CPF inválido.');
  return ok(d);
}
