import { afterEach, describe, expect, it, vi } from 'vitest';
import { headerText, requestCountry, requestPlace } from './requestPlace';

const edge = (h: Record<string, string>) => new Headers({ 'x-mikma-edge': 'segredo', ...h });

describe('de onde veio o acesso (e-mail de segurança)', () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it('cidade, estado e país, com o nome do país em português', () => {
    vi.stubEnv('EDGE_SHARED_SECRET', 'segredo');
    expect(requestPlace(edge({ 'cf-ipcity': 'Blumenau', 'cf-region-code': 'SC', 'cf-ipcountry': 'BR' }))).toBe('Blumenau, SC, Brasil');
    expect(requestPlace(edge({ 'cf-ipcountry': 'PT' }))).toBe('Portugal');
    expect(requestPlace(edge({ 'cf-ipcountry': 'T1' }))).toBe('rede Tor');
    expect(requestPlace(edge({ 'cf-ipcountry': 'XX' }))).toBeNull();
  });

  it('acento que chegou como latin1 volta a ser UTF-8', () => {
    const latin1 = Buffer.from('São Paulo', 'utf8').toString('latin1');
    expect(headerText(latin1)).toBe('São Paulo');
    expect(headerText('São Paulo')).toBe('São Paulo');
    expect(headerText(undefined)).toBe('');
  });

  it('sem a prova da Cloudflare, não usa os headers (seriam forjáveis)', () => {
    vi.stubEnv('EDGE_SHARED_SECRET', 'segredo');
    expect(requestPlace(new Headers({ 'cf-ipcity': 'Blumenau', 'cf-ipcountry': 'BR' }))).toBeNull();
    expect(requestPlace(new Headers({ 'x-mikma-edge': 'errado', 'cf-ipcity': 'Blumenau' }))).toBeNull();
  });

  it('não deixa passar HTML nem texto gigante', () => {
    vi.stubEnv('EDGE_SHARED_SECRET', 'segredo');
    const place = requestPlace(edge({ 'cf-ipcity': `<b>x</b>${'a'.repeat(200)}`, 'cf-region-code': '<script>' }));
    expect(place).not.toMatch(/[<>]/);
    expect(place!.length).toBeLessThanOrEqual(60);
  });
});

describe('país do acesso (trava de lugar novo no login)', () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it('código do país, só com a prova da Cloudflare', () => {
    vi.stubEnv('EDGE_SHARED_SECRET', 'segredo');
    expect(requestCountry(edge({ 'cf-ipcountry': 'BR' }))).toBe('BR');
    expect(requestCountry(edge({ 'cf-ipcountry': ' pt ' }))).toBe('PT');
    expect(requestCountry(edge({ 'cf-ipcountry': 'T1' }))).toBe('T1');
    for (const v of ['XX', '', 'BRA', '<b>', '1A']) expect(requestCountry(edge({ 'cf-ipcountry': v }))).toBeNull();
    expect(requestCountry(new Headers({ 'cf-ipcountry': 'BR' }))).toBeNull();
    expect(requestCountry(new Headers({ 'x-mikma-edge': 'errado', 'cf-ipcountry': 'RU' }))).toBeNull();
  });
});
