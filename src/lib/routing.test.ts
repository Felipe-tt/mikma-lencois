import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { vehicleTypeToProfile, fetchRoute } from './routing';

describe('vehicleTypeToProfile', () => {
  it('mapeia bicicleta pro perfil de ciclismo', () => {
    expect(vehicleTypeToProfile('bicycle')).toBe('cycling-regular');
  });
  it('mapeia a pé pro perfil de caminhada', () => {
    expect(vehicleTypeToProfile('walker')).toBe('foot-walking');
  });
  it('mapeia carro/moto/patinete pro perfil de carro', () => {
    expect(vehicleTypeToProfile('car')).toBe('driving-car');
    expect(vehicleTypeToProfile('motorcycle')).toBe('driving-car');
    expect(vehicleTypeToProfile('scooter')).toBe('driving-car');
  });
  it('usa carro como padrão quando o tipo não é informado', () => {
    expect(vehicleTypeToProfile(undefined)).toBe('driving-car');
  });
  it('usa carro como padrão pra tipo desconhecido', () => {
    expect(vehicleTypeToProfile('teleporte')).toBe('driving-car');
  });
});

describe('fetchRoute', () => {
  const originalKey = process.env.ORS_API_KEY;
  const originalFetch = global.fetch;

  afterEach(() => {
    process.env.ORS_API_KEY = originalKey;
    global.fetch = originalFetch;
  });

  it('sem ORS_API_KEY usa o OSRM público', async () => {
    delete process.env.ORS_API_KEY;
    const mock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ routes: [{ geometry: { coordinates: [[-49.0, -26.9], [-49.02, -26.905], [-49.05, -26.91]] } }] }),
    });
    global.fetch = mock as unknown as typeof fetch;

    const result = await fetchRoute({ lat: -26.9, lng: -49.0 }, { lat: -26.91, lng: -49.05 });
    expect(String(mock.mock.calls[0][0])).toContain('routing.openstreetmap.de/routed-car/');
    expect(result).toEqual([
      { lat: -26.9, lng: -49.0 },
      { lat: -26.905, lng: -49.02 },
      { lat: -26.91, lng: -49.05 },
    ]);
  });

  it('ORS com erro cai pro OSRM', async () => {
    process.env.ORS_API_KEY = 'test-key';
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'erro' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ routes: [{ geometry: { coordinates: [[-49.0, -26.9], [-49.05, -26.91]] } }] }) }) as unknown as typeof fetch;

    const result = await fetchRoute({ lat: -26.9, lng: -49.0 }, { lat: -26.91, lng: -49.05 });
    expect(result).toHaveLength(2);
  });

  it('converte coordenadas [lng, lat] do GeoJSON pra [lat, lng]', async () => {
    process.env.ORS_API_KEY = 'test-key';
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [{ geometry: { coordinates: [[-49.0, -26.9], [-49.05, -26.91]] } }],
      }),
    }) as unknown as typeof fetch;

    const result = await fetchRoute({ lat: -26.9, lng: -49.0 }, { lat: -26.91, lng: -49.05 });
    expect(result).toEqual([
      { lat: -26.9, lng: -49.0 },
      { lat: -26.91, lng: -49.05 },
    ]);
  });

  it('retorna null sem lançar quando a API responde erro', async () => {
    process.env.ORS_API_KEY = 'test-key';
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'unauthorized',
    }) as unknown as typeof fetch;

    const result = await fetchRoute({ lat: -26.9, lng: -49.0 }, { lat: -26.91, lng: -49.05 });
    expect(result).toBeNull();
  });

  it('retorna null sem lançar quando a rede falha', async () => {
    process.env.ORS_API_KEY = 'test-key';
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    const result = await fetchRoute({ lat: -26.9, lng: -49.0 }, { lat: -26.91, lng: -49.05 });
    expect(result).toBeNull();
  });
});
