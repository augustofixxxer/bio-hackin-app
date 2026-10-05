create table public.aprendizajes_experimentales (
  id uuid primary key default gen_random_uuid(),
  experimento_id uuid not null,
  usuario_id uuid not null,
  variable text not null,
  contexto text null,
  observacion_a text not null,
  observacion_b text not null,
  diferencia_observada text null,
  que_se_mantiene text null,
  aprendizaje text not null,
  estado text not null default 'registrado',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint aprendizajes_experimentales_experimento_id_fkey
    foreign key (experimento_id)
    references public.premium_experimentos(id)
    on delete restrict,

  constraint aprendizajes_experimentales_experimento_id_key
    unique (experimento_id),

  constraint aprendizajes_experimentales_estado_check
    check (estado in ('registrado','reutilizable','patron_personal','descartado'))
);

alter table public.aprendizajes_experimentales enable row level security;

create policy "Users can view their own experimental learnings"
on public.aprendizajes_experimentales
for select
to authenticated
using ((select auth.uid()) = usuario_id);

create index aprendizajes_experimentales_usuario_id_idx
  on public.aprendizajes_experimentales (usuario_id);

create index aprendizajes_experimentales_usuario_estado_idx
  on public.aprendizajes_experimentales (usuario_id, estado);