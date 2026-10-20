-- Contrato v02 para experimentos adaptativos.
-- Mantiene opcion_a/opcion_b y registro_a/registro_b durante la transición
-- para no romper clientes ya desplegados; los nuevos flujos deben usar JSON estructurado.

alter table public.premium_experimentos
  add column if not exists tipo_variable text,
  add column if not exists condicion_aplicada jsonb,
  add column if not exists contexto_tarjeta jsonb,
  add column if not exists resultado_cualitativo jsonb not null default '{}'::jsonb;

-- Backfill de filas existentes para que los experimentos previos sigan siendo legibles.
update public.premium_experimentos
set
  tipo_variable = coalesce(nullif(trim(tipo_variable), ''), nullif(trim(variable), ''), 'general'),
  condicion_aplicada = coalesce(
    condicion_aplicada,
    jsonb_build_object(
      'a', jsonb_build_object('etiqueta', opcion_a, 'parametros', '{}'::jsonb),
      'b', jsonb_build_object('etiqueta', opcion_b, 'parametros', '{}'::jsonb)
    )
  ),
  resultado_cualitativo = coalesce(resultado_cualitativo, '{}'::jsonb)
where tipo_variable is null
   or condicion_aplicada is null
   or resultado_cualitativo is null;

alter table public.premium_experimentos
  alter column tipo_variable set not null;

alter table public.premium_experimentos
  drop constraint if exists premium_experimentos_condicion_aplicada_obj_check,
  add constraint premium_experimentos_condicion_aplicada_obj_check
    check (
      jsonb_typeof(condicion_aplicada) = 'object'
      and condicion_aplicada ? 'a'
      and condicion_aplicada ? 'b'
    ),
  drop constraint if exists premium_experimentos_contexto_tarjeta_check,
  add constraint premium_experimentos_contexto_tarjeta_check
    check (
      contexto_tarjeta is null
      or (
        jsonb_typeof(contexto_tarjeta) = 'object'
        and (
          contexto_tarjeta->>'tarjeta' is null
          or contexto_tarjeta->>'tarjeta' in ('hallazgo', 'sugerencia', 'comparacion')
        )
      )
    ),
  drop constraint if exists premium_experimentos_resultado_cualitativo_obj_check,
  add constraint premium_experimentos_resultado_cualitativo_obj_check
    check (jsonb_typeof(resultado_cualitativo) = 'object');

comment on column public.premium_experimentos.tipo_variable is
  'Clave estable de la variable experimental: coccion, temperatura, almidon, timing u otra.';
comment on column public.premium_experimentos.condicion_aplicada is
  'Condiciones estructuradas de comparación, con claves a y b; cada variante puede incluir etiqueta y parametros.';
comment on column public.premium_experimentos.contexto_tarjeta is
  'Contexto estructurado que origina el experimento desde Hallazgo, Sugerencia o Comparación.';
comment on column public.premium_experimentos.resultado_cualitativo is
  'Observaciones cualitativas estructuradas por variante, con claves a y b.';

create index if not exists premium_experimentos_tipo_variable_idx
  on public.premium_experimentos (usuario_id, tipo_variable, created_at desc);
