-- Etapa Premium 04: experimento personal mínimo funcional
create table if not exists public.premium_experimentos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null,
  origen text,
  titulo text not null,
  variable text not null,
  opcion_a text not null,
  opcion_b text not null,
  registro_a text,
  registro_b text,
  estado text not null default 'abierto' check (estado in ('abierto','cerrado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists premium_experimentos_usuario_created_idx
  on public.premium_experimentos (usuario_id, created_at desc);

alter table public.premium_experimentos enable row level security;

comment on table public.premium_experimentos is
  'Experimentos personales Premium. Acceso exclusivo por backend autorizado; sin políticas públicas.';

