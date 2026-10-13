/**
 * Validação compartilhada do cadastro. Roda no navegador (feedback imediato)
 * e no servidor (fonte da verdade): as mesmas regras nos dois lados evitam
 * que um cliente adulterado grave dados que a interface jamais aceitaria.
 */
import { isValidCpf, isValidPhone, onlyDigits } from '@/lib/masks';

export type FieldResult = { ok: true; value: string } | { ok: false; error: string };

const ok = (value: string): FieldResult => ({ ok: true, value });
const fail = (error: string): FieldResult => ({ ok: false, error });

// ── Nome ────────────────────────────────────────────────────────────────────

export const NAME_MAX = 100;

// Letras de qualquer idioma (acentos incluídos), espaço, apóstrofo, hífen e
// ponto (ex: "D'Ávila", "Ana-Maria", "Jr."). Nada de dígitos ou símbolos.
const NAME_CHARS = /^[\p{L}\p{M}][\p{L}\p{M}' .\-’]*$/u;
const NAME_STRIP = /[^\p{L}\p{M}' .\-’]/gu;

/** Remove o que não pode estar num nome (dígitos, símbolos, emojis, controle). */
export function stripNameChars(raw: string): string {
  return raw.normalize('NFC').replace(NAME_STRIP, '').replace(/\s{2,}/g, ' ').slice(0, NAME_MAX);
}

export function normalizeName(raw: string): string {
  return stripNameChars(raw).trim();
}

export function validateName(raw: string): FieldResult {
  const input = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!input) return fail('Informe seu nome completo.');
  if (input.length > NAME_MAX) return fail(`O nome pode ter no máximo ${NAME_MAX} caracteres.`);
  if (!NAME_CHARS.test(input)) return fail('O nome deve ter apenas letras. Não use números ou símbolos.');
  const parts = input.split(' ').filter(Boolean);
  const letters = (s: string) => s.replace(/[^\p{L}]/gu, '');
  if (parts.length < 2 || letters(parts[0]).length < 2 || letters(parts[parts.length - 1]).length < 2) {
    return fail('Informe nome e sobrenome.');
  }
  if (/(.)\1{3,}/u.test(letters(input).toLowerCase())) return fail('Esse nome não parece válido.');
  return ok(input);
}

// ── E-mail ──────────────────────────────────────────────────────────────────

export const EMAIL_MAX = 254;

// Parte local: caracteres comuns de e-mail, sem ponto no início, no fim ou duplo.
const EMAIL_LOCAL = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
// Domínio: rótulos de 1 a 63 caracteres, sem hífen nas pontas, TLD só com letras (2+).
const EMAIL_LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const EMAIL_TLD = /^[a-z]{2,24}$/;

export function normalizeEmail(raw: string): string {
  return raw.normalize('NFKC').trim().toLowerCase();
}

export function validateEmail(raw: string): FieldResult {
  const email = normalizeEmail(raw);
  if (!email) return fail('Informe seu e-mail.');
  if (email.length > EMAIL_MAX) return fail('E-mail muito longo.');
  if (/\s/.test(email)) return fail('O e-mail não pode ter espaços.');
  const at = email.indexOf('@');
  if (at < 1 || at !== email.lastIndexOf('@')) return fail('Informe um e-mail válido, como nome@exemplo.com.');
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length > 64 || !EMAIL_LOCAL.test(local)) return fail('Esse e-mail não parece válido.');
  const labels = domain.split('.');
  if (
    labels.length < 2 ||
    !labels.every(l => EMAIL_LABEL.test(l)) ||
    !EMAIL_TLD.test(labels[labels.length - 1])
  ) {
    return fail('O domínio do e-mail não parece válido.');
  }
  return ok(email);
}

// Erros de digitação comuns nos provedores mais usados no Brasil.
const DOMAIN_TYPOS: Record<string, string> = {
  'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gamil.com': 'gmail.com',
  'gmail.con': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.com.br': 'gmail.com',
  'hotmial.com': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'hotmail.con': 'hotmail.com',
  'outlok.com': 'outlook.com', 'outlook.con': 'outlook.com',
  'yaho.com': 'yahoo.com', 'yahoo.con': 'yahoo.com', 'yahoo.com.com': 'yahoo.com.br',
  'icloud.con': 'icloud.com', 'uol.com': 'uol.com.br', 'bol.com': 'bol.com.br',
};

/** Sugere correção para domínios com erro de digitação, ou null se estiver ok. */
export function suggestEmailFix(raw: string): string | null {
  const email = normalizeEmail(raw);
  const at = email.lastIndexOf('@');
  if (at < 1) return null;
  const fixed = DOMAIN_TYPOS[email.slice(at + 1)];
  return fixed ? `${email.slice(0, at)}@${fixed}` : null;
}

// ── Senha ───────────────────────────────────────────────────────────────────

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

const COMMON_PASSWORDS = new Set([
  '12345678', '123456789', '1234567890', '123123123', '11111111', '00000000',
  'password', 'password1', 'senha123', 'senha1234', 'senha@123', 'abc12345',
  'qwerty123', 'qwertyuiop', 'q1w2e3r4', 'iloveyou1', 'admin123', 'brasil123',
  'mudar123', 'teste123', 'abcd1234', 'a1234567', '1q2w3e4r', 'corinthians1',
  'flamengo1', 'minhasenha1', 'senha12345', 'lencol123', 'mikma123',
]);

export type PasswordCheck = { label: string; ok: boolean };

/** Requisitos exibidos na tela (a mesma lista alimenta a validação). */
export function passwordChecks(password: string): PasswordCheck[] {
  return [
    { label: `Mínimo ${PASSWORD_MIN} caracteres`, ok: password.length >= PASSWORD_MIN },
    { label: 'Pelo menos uma letra', ok: /\p{L}/u.test(password) },
    { label: 'Pelo menos um número', ok: /\d/.test(password) },
  ];
}

export function validatePassword(password: string, email?: string): FieldResult {
  if (!password) return fail('Crie uma senha.');
  if (password.length < PASSWORD_MIN) return fail(`A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.`);
  if (password.length > PASSWORD_MAX) return fail(`A senha pode ter no máximo ${PASSWORD_MAX} caracteres.`);
  if (!/\p{L}/u.test(password) || !/\d/.test(password)) return fail('Use pelo menos uma letra e um número.');
  if (/^\s|\s$/.test(password)) return fail('A senha não pode começar nem terminar com espaço.');
  if (COMMON_PASSWORDS.has(password.toLowerCase()) || /^(.)\1+$/.test(password)) {
    return fail('Essa senha é muito comum. Escolha outra.');
  }
  if (email) {
    const local = normalizeEmail(email).split('@')[0];
    if (local.length >= 4 && password.toLowerCase().includes(local)) {
      return fail('A senha não pode conter o seu e-mail.');
    }
  }
  return ok(password);
}

// ── Telefone e CPF (opcionais) ───────────────────────────────────────────────

/** Telefone BR: 10 ou 11 dígitos, DDD válido e celular começando com 9. */
export function validatePhone(raw: string): FieldResult {
  const d = onlyDigits(raw);
  if (!d) return ok('');
  if (!isValidPhone(d)) return fail('Telefone inválido. Use DDD + número.');
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99 || ddd % 10 === 0) return fail('DDD inválido.');
  if (d.length === 11 && d[2] !== '9') return fail('Celular deve começar com 9 depois do DDD.');
  if (d.length === 10 && !/[2-5]/.test(d[2])) return fail('Telefone fixo inválido.');
  if (/^(\d)\1+$/.test(d.slice(2))) return fail('Telefone inválido.');
  return ok(d);
}

export function validateCpf(raw: string): FieldResult {
  const d = onlyDigits(raw);
  if (!d) return ok('');
  if (!isValidCpf(d)) return fail('CPF inválido.');
  return ok(d);
}
