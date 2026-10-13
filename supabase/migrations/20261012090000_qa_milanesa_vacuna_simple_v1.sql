-- QA milanesa vacuna simple v1.0
-- Fuente: SARA 2 / ENNyS 2, "Milanesa de carne vacuna rebozada (carnicería)".
-- La fuente publica valores por 100 g y no especifica método de cocción.
-- No se infiere fritura/horno, ni se agrega guarnición.
-- Idempotente: se puede volver a ejecutar sin duplicar registros.

begin;


-- Preflight de integridad: abortar antes de escribir si una clave natural ya
-- pertenece a otro UUID o si un UUID fijo está ocupado por otro registro.
-- Así evitamos que los UPSERT oculten colisiones y dejen relaciones huérfanas.
do $preflight$
begin
  if exists (
    select 1 from public.motor_nutricional_qa_comidas
    where clave = 'milanesa_vacuna_simple_sara2_v1'
      and id <> '50000000-0000-4000-8000-000000000006'
  ) then
    raise exception 'QA milanesa: la clave ya existe con otro id; revisar antes de migrar';
  end if;

  if exists (
    select 1 from public.motor_nutricional_qa_comidas
    where id = '50000000-0000-4000-8000-000000000006'
      and clave <> 'milanesa_vacuna_simple_sara2_v1'
  ) then
    raise exception 'QA milanesa: el id fijo del fixture ya pertenece a otra clave';
  end if;

  if exists (
    select 1 from public.motor_nutricional_qa_composicion_estandar
    where version = 'v1.0' and clave_plato = 'milanesa_vacuna_simple_sara2_v1'
      and id <> '0c1a5326-2e75-4898-a10d-ce38dea9454d'
  ) then
    raise exception 'QA milanesa: la clave/version del estándar ya tiene otro id';
  end if;

  if exists (
    select 1 from public.motor_nutricional_qa_composicion_estandar
    where id = '0c1a5326-2e75-4898-a10d-ce38dea9454d'
      and not (version = 'v1.0' and clave_plato = 'milanesa_vacuna_simple_sara2_v1')
  ) then
    raise exception 'QA milanesa: el id fijo del estándar ya pertenece a otro contrato';
  end if;

  if exists (
    select 1 from public.motor_nutricional_composicion
    where id in (
      '32000000-0000-4000-8000-000000000061',
      '32000000-0000-4000-8000-000000000062',
      '32000000-0000-4000-8000-000000000063',
      '32000000-0000-4000-8000-000000000064'
    )
    and not (
      alimento_id = '32000000-0000-4000-8000-000000000006'
      and nutriente_id in (
        'f8e1f7c9-19e4-4b77-a016-bf0845884a76',
        '5cb4586d-0b36-4614-8b9a-0dd10af8d621',
        'b44b30f6-c2a6-4aeb-bac2-856bef2dd13d',
        '3bc844e4-4a12-44e6-ac7e-d32d5cc2b5d0'
      )
    )
  ) then
    raise exception 'QA milanesa: uno de los ids de composición está ocupado por otro registro';
  end if;

  if exists (
    select 1 from public.motor_nutricional_qa_composicion_estandar_componentes
    where id = '6c1a5326-2e75-4898-a10d-ce38dea9454d'
      and not (
        composicion_id = '0c1a5326-2e75-4898-a10d-ce38dea9454d'
        and alimento_id = '32000000-0000-4000-8000-000000000006'
      )
  ) then
    raise exception 'QA milanesa: el id fijo del componente está ocupado por otra relación';
  end if;

  if exists (
    select 1 from public.motor_nutricional_qa_vectores
    where id in (
      '7c1a5326-2e75-4898-a10d-ce38dea94541',
      '7c1a5326-2e75-4898-a10d-ce38dea94542',
      '7c1a5326-2e75-4898-a10d-ce38dea94543',
      '7c1a5326-2e75-4898-a10d-ce38dea94544'
    )
    and comida_id <> '50000000-0000-4000-8000-000000000006'
  ) then
    raise exception 'QA milanesa: uno de los ids de vector está ocupado por otra comida';
  end if;
end
$preflight$;


-- 1) Completar el catálogo nutricional existente, que ya identifica el alimento SARA2.
insert into public.motor_nutricional_composicion
  (id, alimento_id, nutriente_id, valor_por_100g, unidad, valor_min, valor_max, calidad_dato, fuente_id, trazabilidad)
values
  ('32000000-0000-4000-8000-000000000061', '32000000-0000-4000-8000-000000000006', 'f8e1f7c9-19e4-4b77-a016-bf0845884a76', 160, 'kcal', null, null, 'fuente', '10000000-0000-4000-8000-000000000002', 'SARA 2 / ENNyS 2: Milanesa de carne vacuna rebozada (carnicería), tabla 7.A; valor por 100 g de porción comestible; método de cocción no especificado.'),
  ('32000000-0000-4000-8000-000000000062', '32000000-0000-4000-8000-000000000006', '5cb4586d-0b36-4614-8b9a-0dd10af8d621', 18.9, 'g', null, null, 'fuente', '10000000-0000-4000-8000-000000000002', 'SARA 2 / ENNyS 2: Milanesa de carne vacuna rebozada (carnicería), tabla 7.A; valor por 100 g de porción comestible; método de cocción no especificado.'),
  ('32000000-0000-4000-8000-000000000063', '32000000-0000-4000-8000-000000000006', 'b44b30f6-c2a6-4aeb-bac2-856bef2dd13d', 3.0, 'g', null, null, 'fuente', '10000000-0000-4000-8000-000000000002', 'SARA 2 / ENNyS 2: Milanesa de carne vacuna rebozada (carnicería), tabla 7.A; valor por 100 g de porción comestible; método de cocción no especificado.'),
  ('32000000-0000-4000-8000-000000000064', '32000000-0000-4000-8000-000000000006', '3bc844e4-4a12-44e6-ac7e-d32d5cc2b5d0', 14.5, 'g', null, null, 'fuente', '10000000-0000-4000-8000-000000000002', 'SARA 2 / ENNyS 2: Milanesa de carne vacuna rebozada (carnicería), tabla 7.A; carbohidratos disponibles por 100 g de porción comestible; método de cocción no especificado.')
on conflict (alimento_id, nutriente_id) do update set
  valor_por_100g = excluded.valor_por_100g,
  unidad = excluded.unidad,
  valor_min = excluded.valor_min,
  valor_max = excluded.valor_max,
  calidad_dato = excluded.calidad_dato,
  fuente_id = excluded.fuente_id,
  trazabilidad = excluded.trazabilidad;

-- 2) Crear fixture QA separado, sin tocar el plato milanesa + papas.
insert into public.motor_nutricional_qa_comidas
  (id, clave, descripcion, tipo, estado, criterio)
values
  ('50000000-0000-4000-8000-000000000006',
   'milanesa_vacuna_simple_sara2_v1',
   'Milanesa de carne vacuna rebozada, sin guarnición; cocción no especificada',
   'fixture',
   'listo',
   'SARA 2 / ENNyS 2, tabla 7.A; valores fuente por 100 g; no inferir fritura ni horno.')
on conflict (clave) do update set
  descripcion = excluded.descripcion,
  tipo = excluded.tipo,
  estado = excluded.estado,
  criterio = excluded.criterio;

-- 3) Contrato cuantitativo de 100 g: se conserva la base publicada por la fuente.
insert into public.motor_nutricional_qa_composicion_estandar
  (id, version, clave_plato, nombre_visible, peso_estandar_g, estado_qa,
   criterio_composicion, fuente_base, limitaciones, regla_id,
   peso_composicion_original_g, factor_normalizacion_300g,
   margen_normalizacion_min_g, margen_normalizacion_max_g)
values
  ('0c1a5326-2e75-4898-a10d-ce38dea9454d',
   'v1.0',
   'milanesa_vacuna_simple_sara2_v1',
   'Milanesa de carne vacuna rebozada (sin guarnición)',
   100,
   'validada',
   'Fuente oficial por 100 g de porción comestible. No se especifica método de cocción; no se infiere.',
   'SARA 2 / ENNyS 2: Milanesa de carne vacuna rebozada (carnicería), tabla 7.A. https://iah.salud.gob.ar/doc/720.pdf',
   'Solo se muestran los nutrientes publicados en la fuente. No representa una milanesa frita u horneada identificada, ni incluye guarnición. Porción de referencia QA de 100 g, no recomendación de porción.',
   'ec985b58-bf9e-4845-873e-16584ea402a9',
   100,
   null,
   null,
   null)
on conflict (version, clave_plato) do update set
  nombre_visible = excluded.nombre_visible,
  peso_estandar_g = excluded.peso_estandar_g,
  estado_qa = excluded.estado_qa,
  criterio_composicion = excluded.criterio_composicion,
  fuente_base = excluded.fuente_base,
  limitaciones = excluded.limitaciones,
  regla_id = excluded.regla_id,
  peso_composicion_original_g = excluded.peso_composicion_original_g,
  factor_normalizacion_300g = excluded.factor_normalizacion_300g,
  margen_normalizacion_min_g = excluded.margen_normalizacion_min_g,
  margen_normalizacion_max_g = excluded.margen_normalizacion_max_g;

-- 4) Trazabilidad del único componente: la milanesa fuente, 100 g.
insert into public.motor_nutricional_qa_composicion_estandar_componentes
  (id, composicion_id, alimento_id, componente, fraccion, gramos_estandar, estado_qa, criterio)
values
  ('6c1a5326-2e75-4898-a10d-ce38dea9454d',
   '0c1a5326-2e75-4898-a10d-ce38dea9454d',
   '32000000-0000-4000-8000-000000000006',
   'milanesa_vacuna_rebozada',
   1,
   100,
   'validado',
   'Componente único conforme a SARA 2 / ENNyS 2; cocción no especificada.')
on conflict (id) do update set
  composicion_id = excluded.composicion_id,
  alimento_id = excluded.alimento_id,
  componente = excluded.componente,
  fraccion = excluded.fraccion,
  gramos_estandar = excluded.gramos_estandar,
  estado_qa = excluded.estado_qa,
  criterio = excluded.criterio;

-- 5) Solo cuatro nutrientes publicados; los demás quedan ausentes, nunca se convierten en cero.
insert into public.motor_nutricional_qa_vectores
  (id, comida_id, nutriente_id, estado_vector, valor_total,
   componentes_totales, componentes_con_dato, componentes_sin_dato,
   componentes_inciertos, motivo, elegible_interaccion, contrato_version)
values
  ('7c1a5326-2e75-4898-a10d-ce38dea94541', '50000000-0000-4000-8000-000000000006', 'f8e1f7c9-19e4-4b77-a016-bf0845884a76', 'completo', 160, 1, 1, 0, 0, 'SARA 2 / ENNyS 2 publica 160 kcal por 100 g.', true, 'v1.0'),
  ('7c1a5326-2e75-4898-a10d-ce38dea94542', '50000000-0000-4000-8000-000000000006', '5cb4586d-0b36-4614-8b9a-0dd10af8d621', 'completo', 18.9, 1, 1, 0, 0, 'SARA 2 / ENNyS 2 publica 18,9 g de proteína por 100 g.', true, 'v1.0'),
  ('7c1a5326-2e75-4898-a10d-ce38dea94543', '50000000-0000-4000-8000-000000000006', 'b44b30f6-c2a6-4aeb-bac2-856bef2dd13d', 'completo', 3.0, 1, 1, 0, 0, 'SARA 2 / ENNyS 2 publica 3,0 g de grasa total por 100 g.', true, 'v1.0'),
  ('7c1a5326-2e75-4898-a10d-ce38dea94544', '50000000-0000-4000-8000-000000000006', '3bc844e4-4a12-44e6-ac7e-d32d5cc2b5d0', 'completo', 14.5, 1, 1, 0, 0, 'SARA 2 / ENNyS 2 publica 14,5 g de carbohidratos disponibles por 100 g.', true, 'v1.0')
on conflict (comida_id, nutriente_id) do update set
  estado_vector = excluded.estado_vector,
  valor_total = excluded.valor_total,
  componentes_totales = excluded.componentes_totales,
  componentes_con_dato = excluded.componentes_con_dato,
  componentes_sin_dato = excluded.componentes_sin_dato,
  componentes_inciertos = excluded.componentes_inciertos,
  motivo = excluded.motivo,
  elegible_interaccion = excluded.elegible_interaccion,
  contrato_version = excluded.contrato_version;

commit;
