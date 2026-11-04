import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed } from '../src/rss.mjs';

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title><![CDATA[Operativo en el puerto: 12 detenidos]]></title><link>https://m.invalid/a</link><pubDate>Wed, 04 Nov 2026 11:30:00 GMT</pubDate></item>
<item><title>Cortes &amp; desvíos por el temporal</title><link>https://m.invalid/b</link><pubDate>Wed, 04 Nov 2026 10:00:00 +0000</pubDate></item>
<item><title>Sin fecha</title><link>https://m.invalid/c</link></item>
<item><title>Enlace roto</title><link>no-es-url</link><pubDate>Wed, 04 Nov 2026 10:00:00 GMT</pubDate></item>
<item><title>   </title><link>https://m.invalid/d</link><pubDate>Wed, 04 Nov 2026 10:00:00 GMT</pubDate></item>
</channel></rss>`;

const ATOM = `<feed xmlns="http://www.w3.org/2005/Atom">
<entry><title>Nota atom</title><link rel="alternate" href="https://m.invalid/e"/><link rel="self" href="https://m.invalid/self"/><published>2026-11-04T09:00:00Z</published></entry>
<entry><title>Solo actualizada</title><link href="https://m.invalid/f"/><updated>2026-11-04T08:00:00Z</updated></entry>
</feed>`;

test('lee RSS: CDATA, entidades y fechas a ISO', () => {
  const items = parseFeed(RSS);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'Operativo en el puerto: 12 detenidos');
  assert.equal(items[0].published, '2026-11-04T11:30:00.000Z');
  assert.equal(items[1].title, 'Cortes & desvíos por el temporal');
});

test('omite entradas sin fecha, sin enlace válido o sin título', () => {
  const titles = parseFeed(RSS).map((i) => i.title);
  assert.ok(!titles.includes('Sin fecha') && !titles.includes('Enlace roto'));
});

test('lee Atom y elige el enlace alternate', () => {
  const items = parseFeed(ATOM);
  assert.equal(items.length, 2);
  assert.equal(items[0].link, 'https://m.invalid/e');
  assert.equal(items[1].link, 'https://m.invalid/f');
});

test('un texto que no es un feed devuelve una lista vacía', () => {
  assert.deepEqual(parseFeed('<html><body>hola</body></html>'), []);
  assert.deepEqual(parseFeed(''), []);
});
