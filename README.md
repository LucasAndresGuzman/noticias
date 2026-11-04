# Verificador de noticias · servidor (prueba privada)

Lee noticias por RSS, las agrupa por hecho, calcula el nivel de respaldo de evidencia y publica un Top 10 por país a través de una API protegida con usuario y contraseña.

Tres piezas independientes, que se pueden reunir en Render sin cambiar código:

| Pieza | Qué hace | Dónde |
| --- | --- | --- |
| Base de datos | Notas, evidencia, historial y resultados | Neon o Supabase (o la de Render) |
| Worker | Lee feeds, calcula y guarda cada pocos minutos | Render (Background Worker) |
| API / web | Entrega el Top 10 con contraseña | Render (Web Service) o Vercel (funciones en `api/`) |

## Estado: qué está probado y qué no

- **Probado (40 tests, `npm test`):** puntaje de evidencia, agrupación y ranking, lector de RSS y Atom, ingesta con feeds caídos, flujo completo con historial de 3 horas, validación de hechos, API, acceso con contraseña, servidor HTTP y bucle del worker.
- **NO probado:** la capa PostgreSQL (`src/repo-pg.mjs`), los scripts de `scripts/` y el adaptador de Vercel (`api/_lib.js`). Se escribieron sin acceso a una base ni a `npm`. Solo se verificó la sintaxis. **El primer paso del despliegue es `npm run smoke-db`**, que prueba esa capa contra tu base real y limpia lo que crea.

## Probar en tu computadora

Requiere Node 20 o superior.

```
npm install
npm test
```

Las pruebas usan una base en memoria: no necesitan nada más.

## Despliegue privado paso a paso

1. **Repositorio.** Subí esta carpeta a un repositorio **privado** de GitHub. El `.gitignore` ya excluye `.env`.
2. **Base de datos (Neon).** Creá un proyecto y copiá la cadena de conexión. Para Vercel usá la versión "pooled". Guardala solo en los paneles de cada servicio, nunca en el repositorio.
3. **Tablas y prueba de humo**, desde tu computadora con la cadena en una variable de entorno:
   ```
   DATABASE_URL="..." npm run migrate
   DATABASE_URL="..." npm run smoke-db
   ```
   Tiene que terminar con `Capa PostgreSQL: OK`. Si falla, el mensaje indica qué consulta; pasámelo.
4. **Datos de ejemplo (opcional).** `DATABASE_URL="..." npm run seed-demo` carga datos ficticios para ver la API funcionando sin feeds reales.
5. **Web.** Elegí una:
   - **Render, Web Service:** build `npm install`, start `npm run web`.
   - **Vercel:** importá el repositorio. Las funciones están en `api/` (`/api/top`, `/api/pending`, `/api/health`).
   
   Variables: `DATABASE_URL`, `BASIC_AUTH_USER`, `BASIC_AUTH_PASS`. Elegí una contraseña larga y única.
6. **Worker (Render, Background Worker):** build `npm install`, start `npm run worker`. Variables: `DATABASE_URL` y `WORKER_INTERVAL_MIN` (por defecto 5).
7. **Probar:** abrí `/api/top?country=AR` en el navegador; pide usuario y contraseña. `/api/pending` muestra los hechos que esperan revisión humana y los que tienen cobertura pero ninguna evidencia.

Para todo en Render: creá la base de datos ahí y usá su cadena como `DATABASE_URL`. El código no cambia.

## Cargar feeds reales

Editá `config/sources.json` y completá `feedUrl` de cada medio con la URL real de su RSS. **Quedaron vacías a propósito: no se inventaron.** Antes de leer un feed, revisá los términos de uso del medio. El worker pide cada feed una vez por corrida, con un nombre de cliente identificable.

## Cargar evidencia

El motor no descubre la evidencia: la cargás vos (o un proceso que se agregue después). Armá un JSON por hecho, por ejemplo:

```json
{
  "id": "medidas-economicas",
  "category": "Economía",
  "articleUrls": ["https://medio-a.example/nota-1", "https://medio-b.example/nota-2"],
  "evidence": [
    { "id": "e1", "type": "official_statement", "origin": "banco-central" },
    { "id": "e2", "type": "independent_outlets", "origin": "prensa" }
  ],
  "flags": { "sensitive": false }
}
```

```
DATABASE_URL="..." npm run add-fact -- hecho.json
```

Tipos de prueba válidos: `judicial_resolution`, `verified_video`, `independent_outlets`, `official_statement`, `court_filing`, `single_source`, `unverified_social`. El comando rechaza tipos desconocidos, ids repetidos y contradicciones que nombren pruebas inexistentes.

Los hechos marcados `sensitive` solo se publican con `"humanReviewed": true`. Un hecho `deniedByPrimary` se publica como Desmentido, también con revisión humana.

## Límites conocidos y decisiones pendientes

- **País por fuente.** Hoy cada medio tiene un país fijo en `config/sources.json`. BBC y CNN en Español cubren Argentina desde afuera: para incluirlos hay que usar un feed específico de Argentina o clasificar cada nota por tema. Decisión pendiente.
- **Agrupación por palabras.** Compara titulares por palabras compartidas. Un mismo hecho redactado muy distinto puede quedar separado. La mejora es agrupar por significado con un modelo de lenguaje, con tope diario de gasto.
- **Lector de RSS simple.** Usa expresiones regulares y descarta lo que no puede leer. Si un medio publica un feed raro, puede quedar sin notas.
- **Sin interfaz web todavía.** Hay API; el prototipo visual sigue aparte y todavía no consume esta API.
- **Pesos sin calibrar.** Los pesos del puntaje y los umbrales de agrupación son valores iniciales.
- **Un solo usuario.** El acceso es una contraseña compartida, suficiente para pruebas privadas.
- **Limpieza.** Se borran automáticamente notas, historial y resultados con más de 7 días para cuidar el plan gratuito de la base.
