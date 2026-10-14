import { describe, it, expect } from 'vitest';
import http from 'node:http';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { authErrorCode } from './authErrors';

describe('authErrorCode', () => {
  it('le o formato novo (code) e o antigo (errorInfo.code)', () => {
    expect(authErrorCode({ code: 'auth/user-not-found' })).toBe('auth/user-not-found');
    expect(authErrorCode({ errorInfo: { code: 'auth/user-not-found' } })).toBe('auth/user-not-found');
  });
  it('ignora valores que nao sao erros do Auth', () => {
    for (const v of [null, undefined, 'x', 42, {}, { code: 'ECONNRESET' }, { code: 7 }]) {
      expect(authErrorCode(v)).toBeUndefined();
    }
  });

  // Contrato com a biblioteca REAL: se uma atualizacao do firebase-admin mudar
  // o formato do erro de novo, este teste quebra no CI e nao em producao.
  it('reconhece "usuario nao existe" lancado pelo firebase-admin real', async () => {
    const server = http.createServer((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ kind: 'identitytoolkit#GetAccountInfoResponse' })); // sem "users"
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as { port: number }).port;
    const prev = process.env.FIREBASE_AUTH_EMULATOR_HOST;
    process.env.FIREBASE_AUTH_EMULATOR_HOST = `127.0.0.1:${port}`;
    const app = initializeApp({ projectId: 'demo-auth-errors' }, `auth-errors-${port}`);
    try {
      let caught: unknown;
      try { await getAuth(app).getUserByEmail('novo@exemplo.com'); } catch (e) { caught = e; }
      expect(caught).toBeDefined();
      expect(authErrorCode(caught)).toBe('auth/user-not-found');
    } finally {
      await deleteApp(app);
      if (prev === undefined) delete process.env.FIREBASE_AUTH_EMULATOR_HOST; else process.env.FIREBASE_AUTH_EMULATOR_HOST = prev;
      await new Promise(r => server.close(r));
    }
  });
});
