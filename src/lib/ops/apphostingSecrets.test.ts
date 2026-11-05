import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { secretNames, missingBindings, REQUIRED_BINDINGS } from '../../../scripts/lib/apphosting-secrets.mjs';

describe('secretNames', () => {
  it('lê os secrets do apphosting.yaml de verdade', () => {
    const names = secretNames(readFileSync('apphosting.yaml', 'utf8'));
    expect(names).toContain('ABACATEPAY_API_KEY');
    expect(names).toContain('ABACATEPAY_SANDBOX_API_KEY');
    expect(new Set(names).size).toBe(names.length);
  });

  it('ignora versão e comentário, e não pega variable nem value', () => {
    const yaml = [
      'env:',
      '  - variable: A',
      '    secret: COM_VERSAO@3',
      '    availability: [RUNTIME]',
      '  - variable: B',
      '    secret: "ENTRE_ASPAS"  # comentário',
      '  - variable: C',
      '    value: secret: NAO',
      '  # secret: COMENTADO',
    ].join('\n');
    expect(secretNames(yaml)).toEqual(['COM_VERSAO', 'ENTRE_ASPAS']);
  });
});

describe('missingBindings', () => {
  it('política igual à dos secrets que funcionam não falta nada', () => {
    const policy = { bindings: REQUIRED_BINDINGS.map(b => ({ role: b.role, members: [b.member, 'user:outro@x.com'] })) };
    expect(missingBindings(policy)).toEqual([]);
  });

  it('só o acesso do site (o erro do #377) acusa viewer e o agente do App Hosting', () => {
    const policy = { bindings: [{ role: REQUIRED_BINDINGS[0].role, members: [REQUIRED_BINDINGS[0].member] }] };
    expect(missingBindings(policy).map(b => b.role)).toEqual(['roles/secretmanager.viewer', 'roles/secretmanager.secretVersionManager']);
  });

  it('secret sem política acusa tudo', () => {
    expect(missingBindings({})).toHaveLength(3);
  });
});
