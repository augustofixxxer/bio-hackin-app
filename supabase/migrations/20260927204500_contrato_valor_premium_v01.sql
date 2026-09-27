-- Premium value contract v01
-- Applied to the live Supabase project before committing this migration artifact.
-- Purpose: separate content knowledge from UI rendering and persist experiment provenance.

alter table public.soluciones
  add column if not exists por_que_cambio text,
  add column if not exists tipo_comparacion text,
  add column if not exists estado_contenido_premium text,
  add column if not exists fuente_conocimiento text;

alter table public.soluciones
  drop constraint if exists soluciones_estado_contenido_premium_check;

alter table public.soluciones
  add constraint soluciones_estado_contenido_premium_check
  check (estado_contenido_premium is null or estado_contenido_premium in ('pendiente','enriquecido','listo'));

alter table public.premium_experimentos
  add column if not exists regla_id uuid references public.reglas(id),
  add column if not exists solucion_id uuid references public.soluciones(id),
  add column if not exists hallazgo_free text,
  add column if not exists hack_concreto text,
  add column if not exists cambio_composicional text,
  add column if not exists aprendizaje_comparativo text,
  add column if not exists que_se_mantiene text;

create index if not exists idx_premium_experimentos_usuario_estado
  on public.premium_experimentos(usuario_id, estado);

create index if not exists idx_premium_experimentos_solucion
  on public.premium_experimentos(solucion_id);
