-- Fase 2 — Motor nutricional cuantitativo
-- Migración ADITIVA / SHADOW. No toca tablas existentes.
-- No activa RLS. No cambia contratos productivos.

create table if not exists public.motor_nutricional_fuentes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  version text,
  tipo text not null,
  uri text,
  fecha_referencia date,
  estado text not null default 'activa'
    check (estado in ('activa','historica','retirada')),
  created_at timestamptz not null default now()
);

create table if not exists public.motor_nutricional_nutrientes (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  unidad_canonica text not null,
  tipo text not null default 'nutriente',
  permite_incertidumbre boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.motor_nutricional_alimentos (
  id uuid primary key default gen_random_uuid(),
  fuente_id uuid not null references public.motor_nutricional_fuentes(id),
  source_food_id text not null,
  descripcion_fuente text not null,
  tipo_fuente text not null,
  estado text not null default 'validado'
    check (estado in ('candidato','validado','retirado')),
  base_comestible text not null default 'edible_portion',
  porcion_default_g numeric,
  porcion_unidad text default 'g',
  preparacion text,
  created_at timestamptz not null default now(),
  unique (fuente_id, source_food_id)
);

create table if not exists public.motor_nutricional_composicion (
  id uuid primary key default gen_random_uuid(),
  alimento_id uuid not null references public.motor_nutricional_alimentos(id) on delete cascade,
  nutriente_id uuid not null references public.motor_nutricional_nutrientes(id),
  valor_por_100g numeric not null,
  unidad text not null,
  valor_min numeric,
  valor_max numeric,
  calidad_dato text not null default 'fuente'
    check (calidad_dato in ('analitico','calculado','fuente','estimado')),
  fuente_id uuid not null references public.motor_nutricional_fuentes(id),
  trazabilidad text,
  created_at timestamptz not null default now(),
  unique (alimento_id, nutriente_id)
);

create table if not exists public.motor_nutricional_aliases (
  id uuid primary key default gen_random_uuid(),
  alimento_id uuid not null references public.motor_nutricional_alimentos(id) on delete cascade,
  alias_normalizado text not null,
  tipo_alias text not null default 'normalizacion',
  estado text not null default 'activo'
    check (estado in ('activo','retirado')),
  unique (alias_normalizado)
);

create table if not exists public.motor_nutricional_interacciones (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,
  nutriente_objetivo text not null,
  factor_modificador text not null,
  direccion text not null
    check (direccion in ('enhancing','inhibitory','contextual')),
  mecanismo_key text not null,
  umbral_min_valor numeric,
  umbral_min_unidad text,
  umbral_estado text not null default 'pending_validation'
    check (umbral_estado in ('pending_validation','validated','disabled')),
  peso_relativo numeric,
  grupo_dominancia text,
  nivel_evidencia text not null
    check (nivel_evidencia in ('alto','medio','especulativo')),
  fuente_id uuid references public.motor_nutricional_fuentes(id),
  notas_validacion text,
  created_at timestamptz not null default now()
);

create index if not exists idx_mn_composicion_alimento
  on public.motor_nutricional_composicion(alimento_id);

create index if not exists idx_mn_composicion_nutriente
  on public.motor_nutricional_composicion(nutriente_id);

create index if not exists idx_mn_alias_normalizado
  on public.motor_nutricional_aliases(alias_normalizado);

create index if not exists idx_mn_interacciones_objetivo
  on public.motor_nutricional_interacciones(nutriente_objetivo);

insert into public.motor_nutricional_fuentes
  (nombre, version, tipo, uri, fecha_referencia)
values
  ('USDA FoodData Central FNDDS', '2021-2023', 'composicion_nutricional',
   'https://www.ars.usda.gov/northeast-area/beltsville-md-bhnrc/beltsville-human-nutrition-center/food-surveys-research-group/docs/fndds-download-databases/',
   '2024-10-01'),
  ('USDA FoodData Central Foundation Foods', 'vigente', 'composicion_analitica',
   'https://fdc.nal.usda.gov/data-documentation/',
   null)
on conflict do nothing;

insert into public.motor_nutricional_nutrientes (codigo,nombre,unidad_canonica,tipo)
values
 ('energy_kcal','Energía','kcal','nutriente'),
 ('protein_g','Proteína','g','nutriente'),
 ('carbohydrate_g','Carbohidratos','g','nutriente'),
 ('fat_g','Grasa total','g','nutriente'),
 ('fiber_g','Fibra dietaria','g','nutriente'),
 ('iron_total_mg','Hierro total','mg','nutriente'),
 ('iron_heme_mg','Hierro hemo','mg','nutriente'),
 ('iron_nonheme_mg','Hierro no hemo','mg','nutriente'),
 ('calcium_mg','Calcio','mg','nutriente'),
 ('vitamin_c_mg','Vitamina C / ácido ascórbico','mg','nutriente'),
 ('phytate_mg','Fitato','mg','compuesto_interaccion'),
 ('polyphenols_mg','Polifenoles totales','mg','compuesto_interaccion'),
 ('oxalate_mg','Oxalato','mg','compuesto_interaccion'),
 ('sodium_mg','Sodio','mg','nutriente')
on conflict (codigo) do nothing;

-- Interacciones candidatas: se crean como conocimiento estructural,
-- pero permanecen INACTIVAS hasta validar umbral + evidencia.
insert into public.motor_nutricional_interacciones
 (clave,nutriente_objetivo,factor_modificador,direccion,mecanismo_key,
  umbral_estado,grupo_dominancia,nivel_evidencia)
values
 ('iron_nonheme__vitamin_c','iron_nonheme_mg','vitamin_c_mg','enhancing',
  'iron_nonheme_absorption_context','pending_validation','iron_nonheme','alto'),
 ('iron_nonheme__phytate','iron_nonheme_mg','phytate_mg','inhibitory',
  'iron_nonheme_absorption_context','pending_validation','iron_nonheme','alto'),
 ('iron_nonheme__polyphenols','iron_nonheme_mg','polyphenols_mg','inhibitory',
  'iron_nonheme_absorption_context','pending_validation','iron_nonheme','alto'),
 ('iron_nonheme__calcium','iron_nonheme_mg','calcium_mg','contextual',
  'iron_nonheme_absorption_context','pending_validation','iron_nonheme','medio'),
 ('iron_nonheme__oxalate','iron_nonheme_mg','oxalate_mg','inhibitory',
  'iron_nonheme_absorption_context','pending_validation','iron_nonheme','medio')
on conflict (clave) do nothing;
