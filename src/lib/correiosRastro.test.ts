import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { deliveredAt, expectedDelivery, postedAt, sroDate, timelineEvents, trackObjects, type SroObjeto } from './correiosRastro';
import { resetCorreiosToken } from './correiosContrato';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const obj = (...eventos: Array<[string, string, string?]>): SroObjeto => ({
  codObjeto: 'AB123456789BR',
  eventos: eventos.map(([codigo, tipo, dtHrCriado]) => ({ codigo, tipo, dtHrCriado, descricao: `${codigo} ${tipo}` })),
});

describe('situação do objeto', () => {
  it('etiqueta só emitida (FC 82) não é postagem', () => {
    const o = obj(['FC', '82', '2026-11-10T21:00:00']);
    expect(postedAt(o)).toBeNull();
    expect(deliveredAt(o)).toBeNull();
  });

  it('coletado ou postado: data do primeiro manuseio, no fuso de Brasília', () => {
    const o = obj(['RO', '01', '2026-11-11T18:00:00'], ['CO', '01', '2026-11-11T15:30:00'], ['FC', '82', '2026-11-10T21:00:00']);
    expect(postedAt(o)).toBe('2026-11-11T18:30:00.000Z');
  });

  it('entregue só com BDE/BDI/BDR tipo 01; tentativa ou devolução não conta', () => {
    expect(deliveredAt(obj(['PO', '01'], ['BDE', '01', '2026-11-14T10:12:00']))).toBe('2026-11-14T13:12:00.000Z');
    expect(deliveredAt(obj(['PO', '01'], ['BDI', '01']))).not.toBeNull();
    expect(deliveredAt(obj(['PO', '01'], ['BDE', '20']))).toBeNull();
    expect(deliveredAt(obj(['PO', '01'], ['BDE', '23']))).toBeNull();
    expect(postedAt(obj(['BDE', '20']))).not.toBeNull();
  });

  it('objeto não encontrado ou sem resposta', () => {
    expect(postedAt(undefined)).toBeNull();
    expect(deliveredAt({ codObjeto: 'AB123456789BR', mensagem: 'SRO-020: Objeto não encontrado' })).toBeNull();
  });

  it('data sem fuso é horário de Brasília; com fuso é respeitada', () => {
    expect(sroDate('2026-11-11T09:00:00')?.toISOString()).toBe('2026-11-11T12:00:00.000Z');
    expect(sroDate('2026-11-11T09:00:00Z')?.toISOString()).toBe('2026-11-11T09:00:00.000Z');
    expect(sroDate('lixo')).toBeNull();
  });
});

describe('expectedDelivery', () => {
  it('mostra a previsão dos Correios enquanto não foi entregue', () => {
    expect(expectedDelivery({ ...obj(['PO', '01']), dtPrevista: '2026-11-14T23:59:59' })).toBe('2026-11-15T02:59:59.000Z');
    expect(expectedDelivery({ ...obj(['PO', '01'], ['BDE', '01']), dtPrevista: '2026-11-14T23:59:59' })).toBeNull();
    expect(expectedDelivery(obj(['PO', '01']))).toBeNull();
  });
});

describe('timelineEvents', () => {
  it('mais novo primeiro, sem o "etiqueta emitida", com cidade e destino', () => {
    const o: SroObjeto = {
      codObjeto: 'AB123456789BR',
      eventos: [
        { codigo: 'FC', tipo: '82', dtHrCriado: '2026-11-10T21:00:00', descricao: 'Etiqueta emitida' },
        { codigo: 'PO', tipo: '01', dtHrCriado: '2026-11-11T15:30:00', descricao: 'Objeto postado', unidade: { endereco: { cidade: 'Blumenau', uf: 'SC' } } },
        { codigo: 'RO', tipo: '01', dtHrCriado: '2026-11-12T08:05:00', descricao: 'Objeto em transferência', unidade: { endereco: { cidade: 'Indaial', uf: 'SC' } }, unidadeDestino: { endereco: { cidade: 'São Paulo', uf: 'SP' } } },
      ],
    };
    expect(timelineEvents(o)).toEqual([
      { date: '12/11/2026', time: '08:05', location: 'Indaial - SC', status: 'Objeto em transferência', subStatus: ['Para São Paulo - SP'] },
      { date: '11/11/2026', time: '15:30', location: 'Blumenau - SC', status: 'Objeto postado', subStatus: [] },
    ]);
  });
});

describe('trackObjects', () => {
  const tokenOk = () => json({ token: 't', expiraEm: '2099-01-01T10:00:00', cartaoPostagem: { contrato: '9912490489', dr: 68 } }, 201);
  beforeEach(() => {
    resetCorreiosToken();
    vi.stubEnv('CORREIOS_CWS', 'loja:codigo');
    vi.stubEnv('CORREIOS_CARTAO', '0075520150');
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('manda o idioma, agrupa de 50 em 50 e ignora código inválido', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/token/')) return tokenOk();
      urls.push(url);
      expect(new Headers(init?.headers).get('accept-language')).toBe('pt-BR');
      const codes = new URL(url).searchParams.getAll('codigosObjetos');
      return json({ objetos: codes.map(c => ({ codObjeto: c, eventos: [] })) });
    }));
    const codes = Array.from({ length: 60 }, (_, i) => `AB${String(i).padStart(9, '0')}BR`);
    const out = await trackObjects([...codes, 'invalido', codes[0].toLowerCase()]);
    expect(out.size).toBe(60);
    expect(urls).toHaveLength(2);
    expect(new URL(urls[0]).searchParams.getAll('codigosObjetos')).toHaveLength(50);
    expect(new URL(urls[0]).searchParams.get('resultado')).toBe('T');
  });

  it('sem contrato configurado não chama nada', async () => {
    vi.stubEnv('CORREIOS_CWS', '');
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect((await trackObjects(['AB123456789BR'])).size).toBe(0);
    expect(f).not.toHaveBeenCalled();
  });

  it('erro dos Correios sobe para quem chamou', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.includes('/token/') ? tokenOk() : json({}, 500))));
    await expect(trackObjects(['AB123456789BR'])).rejects.toThrow('HTTP 500');
  });
});
