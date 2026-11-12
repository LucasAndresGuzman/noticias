-- Esquema para PostgreSQL (Neon, Supabase o el de Render). Se puede ejecutar varias veces.

create table if not exists articles (
  id           text primary key,          -- huella de la URL
  outlet       text not null,
  owner        text not null,             -- grupo propietario (para diversidad)
  title        text not null,
  published_at timestamptz not null,
  country      text not null,
  url          text not null,
  fetched_at   timestamptz not null default now()
);
create index if not exists articles_published_idx on articles (published_at desc);

-- Evidencia por hecho. article_ids relaciona el hecho con sus notas.
create table if not exists facts (
  id             text primary key,
  article_ids    jsonb not null default '[]',
  category       text not null default '',
  evidence       jsonb not null default '[]',
  contradictions jsonb not null default '[]',
  flags          jsonb not null default '{}',
  alerts         jsonb not null default '[]',
  note           text not null default '',
  updated_at     timestamptz not null default now()
);

-- Nivel de respaldo en cada corrida, para mostrar el cambio de las últimas 3 horas.
create table if not exists level_history (
  fact_id text not null,
  at      timestamptz not null,
  level   integer not null,
  primary key (fact_id, at)
);

-- Resultado completo de cada corrida. La web lee el más reciente.
create table if not exists snapshots (
  id           bigserial primary key,
  generated_at timestamptz not null,
  payload      jsonb not null
);
create index if not exists snapshots_generated_idx on snapshots (generated_at desc);

-- Videos publicados por los canales de YouTube de los medios (id = ID del video).
create table if not exists videos (
  id           text primary key,
  outlet       text not null,
  title        text not null,
  published_at timestamptz not null,
  url          text not null,
  fetched_at   timestamptz not null default now()
);
create index if not exists videos_published_idx on videos (published_at desc);
