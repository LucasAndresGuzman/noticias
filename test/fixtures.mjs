// DATOS FICTICIOS para probar el flujo. No describen hechos reales.
export const NOW = '2026-11-04T12:00:00Z';

const OUTLETS = [
  ['Medio A', 'Grupo A'],
  ['Medio B', 'Grupo B'],
  ['Medio C', 'Grupo C'],
  ['Medio D', 'Grupo D'],
  ['Medio E', 'Grupo E'],
  ['Medio F', 'Grupo F'],
  ['Medio G', 'Grupo A'] // mismo grupo que Medio A
];

const at = (minAgo) => new Date(Date.parse(NOW) - minAgo * 60000).toISOString();

const articles = [];
let n = 0;
function story(key, title, outletIdx, minsAgo) {
  const ids = [];
  outletIdx.forEach((o, i) => {
    const id = `${key}-${++n}`;
    ids.push(id);
    articles.push({
      id,
      outlet: OUTLETS[o][0],
      owner: OUTLETS[o][1],
      title,
      publishedAt: at(minsAgo[i % minsAgo.length]),
      country: 'AR',
      url: `https://ejemplo.invalid/${id}`
    });
  });
  return ids;
}

const ev = (id, type, extra = {}) => ({ id, type, ...extra });

export const facts = [];
const add = (key, title, category, outletIdx, minsAgo, rest) => {
  const articleIds = story(key, title, outletIdx, minsAgo);
  facts.push({ id: key, articleIds, category, contradictions: [], flags: {}, alerts: [], note: '', ...rest });
};

add('puerto', 'Operativo conjunto de fuerzas federales en zona portuaria', 'Seguridad', [0, 1, 2, 3, 4, 5], [2, 30, 90, 150, 200, 400], {
  evidence: [
    ev('e1', 'judicial_resolution', { origin: 'juzgado' }),
    ev('e2', 'official_statement', { origin: 'fuerza' }),
    ev('e3', 'verified_video', { origin: 'camara' }),
    ev('e4', 'independent_outlets', { origin: 'prensa' }),
    ev('e5', 'court_filing', { origin: 'fiscalia' })
  ],
  flags: { sensitive: true, humanReviewed: true }
});

add('temporal', 'Cortes de ruta por temporal en la región sur', 'Clima', [0, 1, 2, 3, 6], [8, 40, 120, 200, 300], {
  evidence: [
    ev('e1', 'official_statement', { origin: 'smn' }),
    ev('e2', 'official_statement', { origin: 'defensa-civil' }),
    ev('e3', 'verified_video', { origin: 'vecino' }),
    ev('e4', 'single_source', { origin: 'radio-local' })
  ]
});

add('denuncia', 'Denuncia por presunto exceso en un procedimiento policial', 'Seguridad', [0, 1, 2, 4, 5], [5, 25, 60, 180, 240], {
  evidence: [
    ev('com', 'official_statement', { origin: 'fuerza' }),
    ev('med', 'independent_outlets', { origin: 'prensa' }),
    ev('vid', 'verified_video', { origin: 'comercio' }),
    ev('den', 'court_filing', { origin: 'juzgado' }),
    ev('old', 'verified_video', { origin: 'redes', reusedVideo: true, alertText: 'fecha no coincide' }),
    ev('r1', 'unverified_social', { coordinated: true }),
    ev('r2', 'unverified_social', { coordinated: true }),
    ev('r3', 'unverified_social', { coordinated: true }),
    ev('r4', 'unverified_social', { coordinated: true })
  ],
  contradictions: [{ a: 'com', b: 'vid' }],
  flags: { sensitive: true, humanReviewed: true },
  note: 'Versión oficial y video difieren'
});

add('economia', 'Anuncio de nuevas medidas económicas', 'Economía', [0, 1, 2, 3, 4, 5, 6], [12, 20, 45, 90, 160, 300, 500], {
  evidence: [
    ev('e1', 'official_statement', { origin: 'gobierno' }),
    ev('e2', 'official_statement', { origin: 'banco-central' }),
    ev('e3', 'independent_outlets', { origin: 'prensa-eco' }),
    ev('e4', 'single_source', { origin: 'analista' })
  ]
});

add('aereo', 'Incidente aéreo en espacio regional', 'Defensa', [0, 2, 4], [21, 50, 130], {
  evidence: [ev('e1', 'official_statement', { origin: 'fuerza-aerea' }), ev('e2', 'independent_outlets', { origin: 'prensa' })],
  note: 'Falta confirmación de la fuerza aérea'
});

add('audio', 'Audio atribuido a un funcionario circula en redes', 'Política', [1, 3, 5], [14, 70, 200], {
  evidence: [
    ev('e1', 'single_source', { origin: 'medio-b' }),
    ev('e2', 'unverified_social', { origin: 'redes' }),
    ev('r1', 'unverified_social', { coordinated: true }),
    ev('r2', 'unverified_social', { coordinated: true })
  ],
  alerts: ['posible contenido alterado']
});

add('tren', 'Accidente ferroviario con servicio interrumpido', 'Transporte', [0, 1, 2, 3, 5], [6, 40, 100, 220, 380], {
  evidence: [
    ev('e1', 'official_statement', { origin: 'operador' }),
    ev('e2', 'official_statement', { origin: 'ministerio' }),
    ev('e3', 'independent_outlets', { origin: 'prensa' }),
    ev('e4', 'verified_video', { origin: 'pasajero' })
  ]
});

add('ciber', 'Ataque informático a un organismo público', 'Tecnología', [1, 2, 4], [32, 120, 260], {
  evidence: [ev('e1', 'official_statement', { origin: 'organismo' }), ev('e2', 'independent_outlets', { origin: 'prensa' }), ev('e3', 'single_source', { origin: 'blog' })]
});

add('clases', 'Rumor de suspensión de clases en todo el país', 'Educación', [2, 4], [40, 90], {
  evidence: [ev('e1', 'single_source', { origin: 'redes' }), ev('e2', 'official_statement', { origin: 'educacion' })],
  flags: { deniedByPrimary: true, sensitive: true, humanReviewed: true },
  note: 'Desmentido por el organismo competente'
});

add('derrame', 'Derrame de combustible en un río cercano a una ciudad', 'Ambiente', [0, 3, 5], [27, 110, 250], {
  evidence: [ev('e1', 'official_statement', { origin: 'ambiente' }), ev('e2', 'independent_outlets', { origin: 'prensa' }), ev('e3', 'verified_video', { origin: 'vecino' })]
});

add('menor', 'Investigación sobre un hecho que involucra a menores', 'Justicia', [0, 1, 2, 3], [10, 30, 70, 120], {
  evidence: [ev('e1', 'independent_outlets', { origin: 'prensa' }), ev('e2', 'official_statement', { origin: 'fiscalia' })],
  flags: { sensitive: true, humanReviewed: false }
});

// Un hecho con cobertura pero sin evidencia cargada
story('sin', 'Polémica por declaraciones en un programa de televisión', [0, 1, 2], [20, 50, 90]);

// Nivel de hace 3 horas, para calcular el cambio
export const previous = {
  puerto: 85,
  temporal: 66,
  denuncia: 55,
  economia: 41,
  aereo: 25,
  audio: 3,
  tren: 61,
  ciber: 31,
  clases: 40,
  derrame: 43
};

export { articles };
