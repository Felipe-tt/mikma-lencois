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

  it('retorna null sem lançar quando ORS_API_KEY não está configurada', async () => {
    delete process.env.ORS_API_KEY;
    const result = await fetchRoute({ lat: -26.9, lng: -49.0 }, { lat: -26.91, lng: -49.05 });
    expect(result).toBeNull();
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
