import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTop } from '../src/engine/pipeline.mjs';
import { articles, facts, previous, NOW } from './fixtures.mjs';

const out = buildTop(articles, facts, previous, NOW);
const top = out.top.AR;

test('devuelve como máximo 10 hechos, numerados, ordenados por relevancia', () => {
  assert.ok(top.length <= 10 && top.length > 0);
  top.forEach((r, i) => assert.equal(r.position, i + 1));
  for (let i = 1; i < top.length; i++) assert.ok(top[i - 1].relevance >= top[i].relevance);
});

test('el hecho sensible sin revisión humana no se publica y queda pendiente', () => {
  assert.ok(!top.some((r) => r.factId === 'menor'));
  assert.ok(out.pendingReview.some((r) => r.factId === 'menor'));
});

test('un hecho con cobertura pero sin evidencia no recibe nivel inventado', () => {
  assert.ok(out.noEvidence.some((r) => r.title.startsWith('Polémica')));
  assert.ok(!top.some((r) => r.title.startsWith('Polémica')));
});

test('la ficha de la denuncia da 47, En disputa y alerta de video', () => {
  const r = top.find((x) => x.factId === 'denuncia');
  assert.equal(r.level, 47);
  assert.equal(r.label, 'En disputa');
  assert.equal(r.videoAlert, true);
  assert.equal(r.alertText, 'fecha no coincide');
  assert.equal(r.delta, 47 - 55);
});

test('el rumor desmentido queda en 9 o menos con etiqueta Desmentido', () => {
  const r = top.find((x) => x.factId === 'clases');
  assert.ok(r.level <= 9);
  assert.equal(r.label, 'Desmentido');
});

test('el operativo con resolución judicial llega a Confirmado sin pasar de 95', () => {
  const r = top.find((x) => x.factId === 'puerto');
  assert.equal(r.label, 'Confirmado');
  assert.ok(r.level >= 85 && r.level <= 95);
});

test('dos medios del mismo grupo cuentan como un solo propietario', () => {
  const r = top.find((x) => x.factId === 'economia');
  assert.equal(r.outlets, 7);
  assert.equal(r.owners, 6);
});

test('un nivel nuevo sin historial no inventa un cambio', () => {
  const o = buildTop(articles, facts, {}, NOW).top.AR;
  assert.equal(o[0].delta, null);
});
