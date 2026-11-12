import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTop } from '../src/engine/pipeline.mjs';

const art = (id, outlet, owner, title) => ({ id, outlet, owner, title, publishedAt: '2026-11-11T10:00:00Z', country: 'AR', url: `https://x.invalid/${id}` });

test('un hecho cuyas notas cayeron en grupos distintos sale en una sola fila con todos sus medios', () => {
  const articles = [
    art('a1', 'Telefe', 'G1', 'León XIV cierra su visita a la Argentina con una misa multitudinaria en Luján'),
    art('a2', 'C5N', 'G2', 'Última misa de León XIV en Argentina: a qué hora puede llover en Luján'),
    art('a3', 'A24', 'G3', 'Las mejores imágenes de la histórica misa del Papa en Luján'),
    art('b1', 'LN+', 'G4', 'Inflación de octubre: el Indec publicará el dato este jueves')
  ];
  const facts = [{ id: 'misa', articleIds: ['a1', 'a2', 'a3'], category: 'Sociedad', evidence: [{ id: 'e1', type: 'official_statement', origin: 'o' }] }];
  const { top } = buildTop(articles, facts, {}, '2026-11-11T12:00:00Z');
  const rows = top.AR.filter((r) => r.factId === 'misa');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].outlets, 3);
});

test('hechos distintos no se mezclan entre sí', () => {
  const articles = [art('a1', 'Telefe', 'G1', 'Misa del Papa en Luján hoy'), art('b1', 'C5N', 'G2', 'Inflación de octubre: dato del Indec')];
  const facts = [
    { id: 'misa', articleIds: ['a1'], evidence: [{ id: 'e1', type: 'single_source' }] },
    { id: 'inflacion', articleIds: ['b1'], evidence: [{ id: 'e1', type: 'single_source' }] }
  ];
  const { top } = buildTop(articles, facts, {}, '2026-11-11T12:00:00Z');
  assert.equal(top.AR.length, 2);
});
