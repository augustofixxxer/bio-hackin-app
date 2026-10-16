-- Persistencia independiente del plan diario; no reutiliza bienestar_diario_real.
create table if not exists public.plan_jornada_diaria (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  fecha date not null,
  tipo text not null check (tipo in ('entreno', 'descanso')),
  hora_sesion time without time zone,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_jornada_diaria_usuario_fecha_key unique (usuario_id, fecha),
  constraint plan_jornada_diaria_hora_coherente check (
    (tipo = 'entreno' and hora_sesion is not null)
    or (tipo = 'descanso' and hora_sesion is null)
  )
);

alter table public.plan_jornada_diaria enable row level security;
revoke all on table public.plan_jornada_diaria from anon, authenticated;
grant select, insert, update on table public.plan_jornada_diaria to service_role;

comment on table public.plan_jornada_diaria is
  'Estado Entreno/Descanso por usuario y fecha. Acceso exclusivamente desde backend autorizado; separado de bienestar_diario_real.';
comment on column public.plan_jornada_diaria.hora_sesion is
  'Hora local de sesión, obligatoria solo cuando tipo = entreno.';
