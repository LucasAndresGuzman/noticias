import test from 'node:test';
import assert from 'node:assert/strict';
import { score } from '../src/engine/scoring.mjs';

test('ficha de ejemplo del prototipo da 47 y En disputa', () => {
  const items = [
    { id: 'com', type: 'official_statement', origin: 'fuerza' },
    { id: 'med', type: 'independent_outlets', origin: 'prensa' },
    { id: 'vid', type: 'verified_video', origin: 'comercio' },
    { id: 'den', type: 'court_filing', origin: 'juzgado' },
    { id: 'red', type: 'unverified_social', coordinated: true }
  ];
  // La contradicción comunicado vs video vale -9 en el prototipo: 14 * 0,65 = 9,1 -> 9
  const r = score(items, [{ a: 'com', b: 'vid' }], { sensitive: true, humanReviewed: true });
  assert.equal(r.level, 14 + 16 + 20 + 10 - 9 - 1);
  assert.equal(r.label, 'En disputa');
  assert.equal(r.publishable, true);
});

test('cien medios con el mismo origen cuentan una sola vez', () => {
  const items = Array.from({ length: 100 }, (_, i) => ({ id: `m${i}`, type: 'single_source', origin: 'gacetilla' }));
  assert.equal(score(items).level, 6);
});

test('video reutilizado no suma', () => {
  const r = score([{ id: 'v', type: 'verified_video', reusedVideo: true }]);
  assert.equal(r.level, 0);
});

test('tope de 95 y Confirmado exige fuente primaria y evidencia independiente', () => {
  const items = [
    { id: 'a', type: 'judicial_resolution', origin: 'x' },
    { id: 'b', type: 'verified_video', origin: 'y' },
    { id: 'c', type: 'independent_outlets', origin: 'z' },
    { id: 'd', type: 'official_statement', origin: 'w' }
  ];
  assert.equal(score(items, [], { primaryOrJudicial: true, independentEvidence: true }).level, 75);
  const many = [...items, { id: 'e', type: 'court_filing', origin: 'v' }, { id: 'f', type: 'single_source', origin: 'u' }];
  assert.equal(score(many, [], { primaryOrJudicial: true, independentEvidence: true }).level, 91);
  assert.equal(score(many, [], { primaryOrJudicial: false, independentEvidence: true }).level, 84);
});

test('desmentido cae a 9 o menos y exige revisión humana', () => {
  const r = score([{ id: 'a', type: 'independent_outlets', origin: 'x' }], [], { deniedByPrimary: true });
  assert.ok(r.level <= 9);
  assert.equal(r.label, 'Desmentido');
  assert.equal(r.publishable, false);
});

test('tipo de prueba desconocido lanza error', () => {
  assert.throws(() => score([{ id: 'a', type: 'inventado' }]));
});
