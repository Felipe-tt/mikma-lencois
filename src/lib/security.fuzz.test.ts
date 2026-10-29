/**
 * Fuzzing (testes de propriedade com fast-check): gera milhares de entradas
 * aleatórias e confere que as funções de segurança nunca deixam passar
 * algo perigoso, não só nos casos que lembramos de escrever à mão.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { escapeHtml, escapeXml, serializeJsonLd } from './html';
import { effectiveRole, hasSecondFactor } from './staffMfa';

const RUNS = { numRuns: 2000 };

describe('fuzz: escape de HTML', () => {
  it('escapeHtml nunca devolve caractere que abre tag ou fecha atributo', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (s) => {
        expect(escapeHtml(s)).not.toMatch(/[<>"']/);
      }),
      RUNS,
    );
  });

  it('escapeHtml é reversível (não perde nem inventa texto)', () => {
    const unescape = (s: string) =>
      s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (s) => {
        expect(unescape(escapeHtml(s))).toBe(s);
      }),
      RUNS,
    );
  });

  it('escapeXml nunca devolve caractere de controle inválido em XML', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (s) => {
        expect(escapeXml(s)).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿<>"']/);
      }),
      RUNS,
    );
  });
});

describe('fuzz: JSON-LD dentro de <script>', () => {
  it('nunca fecha a tag e devolve os mesmos dados', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (data) => {
        const out = serializeJsonLd(data);
        expect(out).not.toMatch(/[<>]/);
        expect(out.toLowerCase()).not.toContain('</script');
        expect(JSON.parse(out)).toEqual(JSON.parse(JSON.stringify(data)));
      }),
      RUNS,
    );
  });
});

describe('fuzz: papel da equipe exige segunda etapa', () => {
  const claims = fc.record(
    {
      role: fc.oneof(fc.constantFrom('admin', 'seller', 'customer', ''), fc.anything()),
      passkey: fc.oneof(fc.boolean(), fc.anything()),
      firebase: fc.record(
        {
          sign_in_provider: fc.oneof(fc.constantFrom('password', 'google.com', 'custom', 'anonymous'), fc.string()),
          sign_in_second_factor: fc.oneof(fc.constant(undefined), fc.constant(''), fc.constant('totp')),
        },
        { requiredKeys: [] },
      ),
    },
    { requiredKeys: [] },
  );

  it('sem segunda etapa nunca sai admin nem seller', () => {
    fc.assert(
      fc.property(claims, (c) => {
        const role = effectiveRole(c as Parameters<typeof effectiveRole>[0]);
        if (!hasSecondFactor(c as Parameters<typeof hasSecondFactor>[0])) {
          expect(role === 'admin' || role === 'seller').toBe(false);
        }
        expect(typeof role).toBe('string');
      }),
      RUNS,
    );
  });
});
