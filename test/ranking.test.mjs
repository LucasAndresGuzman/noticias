import test from 'node:test';
import assert from 'node:assert/strict';
import { cluster, rank, tokens, jaccard } from '../src/engine/ranking.mjs';

const NOW = '2026-11-04T12:00:00Z';
const art = (id, outlet, owner, title, publishedAt, country = 'AR') => ({ id, outlet, owner, title, publishedAt, country });

test('tokens ignora acentos, mayúsculas y palabras vacías', () => {
  const t = tokens('Operativo en el PUERTO: detienen a 12 personas');
  assert.ok(t.has('puerto') && t.has('operativo') && t.has('detienen'));
  assert.ok(!t.has('el') && !t.has('en'));
});

test('jaccard de conjuntos vacíos es 0', () => {
  assert.equal(jaccard(new Set(), new Set(['a'])), 0);
});

test('agrupa titulares del mismo hecho y separa los distintos', () => {
  const arts = [
    art('1', 'A', 'GA', 'Operativo conjunto detiene a 12 personas en el puerto', '2026-11-04T08:00:00Z'),
    art('2', 'B', 'GB', 'Detienen a 12 personas en un operativo en el puerto', '2026-11-04T08:30:00Z'),
    art('3', 'C', 'GC', 'Cortes de ruta por el temporal en la región sur', '2026-11-04T09:00:00Z')
  ];
  const cs = cluster(arts);
  assert.equal(cs.length, 2);
  assert.equal(cs.find((c) => c.members.length === 2).members.length, 2);
});

test('no mezcla países distintos aunque los titulares se parezcan', () => {
  const arts = [
    art('1', 'A', 'GA', 'Cortes de ruta por temporal en la región sur', '2026-11-04T08:00:00Z', 'AR'),
    art('2', 'B', 'GB', 'Cortes de ruta por temporal en la región sur', '2026-11-04T08:10:00Z', 'CL')
  ];
  assert.equal(cluster(arts).length, 2);
});

test('un mismo medio repitiendo la nota no sube la cobertura', () => {
  const spam = Array.from({ length: 8 }, (_, i) =>
    art(`s${i}`, 'A', 'GA', 'Anuncian nuevas medidas económicas del gobierno', `2026-11-04T0${i}:30:00Z`)
  );
  const varied = [
    art('v1', 'A', 'GA', 'Cortes de ruta por temporal en la región sur', '2026-11-04T05:00:00Z'),
    art('v2', 'B', 'GB', 'Cortes de ruta por temporal en la región sur', '2026-11-04T05:10:00Z'),
    art('v3', 'C', 'GC', 'Cortes de ruta por temporal en la región sur', '2026-11-04T05:20:00Z')
  ];
  const r = rank(cluster([...spam, ...varied]), NOW).AR;
  assert.equal(r[0].title.startsWith('Cortes'), true);
  assert.equal(r.find((x) => x.title.startsWith('Anuncian')).outlets, 1);
});

test('dos medios del mismo grupo no suman diversidad doble', () => {
  const arts = [
    art('1', 'A', 'GRUPO', 'Accidente ferroviario con servicio interrumpido', '2026-11-04T08:00:00Z'),
    art('2', 'B', 'GRUPO', 'Accidente ferroviario con servicio interrumpido hoy', '2026-11-04T08:05:00Z')
  ];
  const r = rank(cluster(arts), NOW).AR[0];
  assert.equal(r.outlets, 2);
  assert.equal(r.owners, 1);
});

test('descarta notas fuera de las últimas 24 horas', () => {
  const arts = [art('old', 'A', 'GA', 'Hecho de ayer muy viejo', '2026-11-03T05:00:00Z')];
  assert.equal(rank(cluster(arts), NOW).AR, undefined);
});

test('devuelve como máximo 10 por país, ordenado y numerado', () => {
  const arts = [];
  for (let i = 0; i < 14; i++) {
    for (let j = 0; j < (i % 5) + 1; j++) {
      arts.push(art(`${i}-${j}`, `M${j}`, `G${j}`, `tema${i}x tema${i}y tema${i}z suceso${i}`, '2026-11-04T10:00:00Z'));
    }
  }
  const r = rank(cluster(arts), NOW).AR;
  assert.equal(r.length, 10);
  assert.equal(r[0].position, 1);
  for (let i = 1; i < r.length; i++) assert.ok(r[i - 1].score >= r[i].score);
});
