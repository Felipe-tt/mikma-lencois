import { describe, expect, it } from 'vitest';
import { EMAIL_FRAME_SANDBOX, emailFrameDoc } from './frame';

describe('quadro do e-mail recebido', () => {
  it('sandbox sem script, formulário nem navegar o painel', () => {
    const flags = EMAIL_FRAME_SANDBOX.split(' ');
    expect(flags).not.toContain('allow-scripts');
    expect(flags).not.toContain('allow-forms');
    expect(flags).not.toContain('allow-top-navigation');
    expect(flags).not.toContain('allow-top-navigation-by-user-activation');
    expect(flags).not.toContain('allow-modals');
  });

  it('documento no tema do painel, com links em outra aba', () => {
    const doc = emailFrameDoc('<p>oi</p>', { dark: true });
    expect(doc).toMatch(/^<!doctype html><html class="dark">/);
    expect(doc).toContain('<base target="_blank">');
    expect(doc).toContain('<div id="m"><p>oi</p></div>');
    expect(emailFrameDoc('<p>oi</p>')).toMatch(/^<!doctype html><html><head>/);
  });

  it('CSS extra não fecha o <style>', () => {
    expect(emailFrameDoc('', { css: '</style><p>x' })).not.toContain('</style><p>x');
  });
});
