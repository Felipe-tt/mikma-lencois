import { describe, it, expect } from 'vitest';
import { courierCarColor, courierVehicleLabel } from './carriers';

describe('courierCarColor', () => {
  it('traduz as cores da Uber', () => {
    expect(courierCarColor('White')?.label).toBe('Branco');
    expect(courierCarColor('GREY')?.label).toBe('Cinza');
    expect(courierCarColor('prata')?.label).toBe('Prata');
  });
  it('cor desconhecida fica como veio, com tom neutro', () => {
    expect(courierCarColor('Champagne')).toEqual({ label: 'Champagne', hex: '#C3C7CC' });
    expect(courierCarColor(undefined)).toBeNull();
  });
  it('veículo em português', () => {
    expect(courierVehicleLabel('car')).toBe('Carro');
    expect(courierVehicleLabel('motorcycle')).toBe('Moto');
  });
});
