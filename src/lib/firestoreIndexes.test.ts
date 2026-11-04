import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// O deploy dos índices (deploy.yml) recusa o arquivo inteiro se tiver um
// índice de um campo só ("this index is not necessary", HTTP 400): o
// Firestore já cria esses sozinho. Aí nenhum índice novo sobe e a consulta
// que precisa dele falha em produção com FAILED_PRECONDITION.
describe('firestore.indexes.json', () => {
  const { indexes } = JSON.parse(readFileSync('firestore.indexes.json', 'utf8')) as {
    indexes: { collectionGroup: string; fields: { fieldPath: string }[] }[];
  };

  it('só tem índices compostos (dois campos ou mais)', () => {
    const single = indexes.filter(i => i.fields.length < 2).map(i => `${i.collectionGroup}: ${i.fields[0]?.fieldPath}`);
    expect(single).toEqual([]);
  });

  it('tem o índice do lembrete de avaliação (status + entrega)', () => {
    expect(indexes.some(i => i.collectionGroup === 'orders'
      && i.fields.map(f => f.fieldPath).join(',') === 'status,delivery.deliveredAt')).toBe(true);
  });
});
