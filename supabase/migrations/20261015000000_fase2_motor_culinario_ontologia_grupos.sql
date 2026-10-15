-- Fase 2: matriz configurable de reglas culinarias por grupos de ingredientes.
create table if not exists public.config_reglas_grupos_culinarios (
  clave text primary key,
  nombre text not null,
  terminos text[] not null default '{}',
  reglas jsonb not null default '{}'::jsonb,
  prioridad integer not null default 100,
  activo boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.config_reglas_grupos_culinarios enable row level security;
revoke all on public.config_reglas_grupos_culinarios from anon, authenticated;
grant all on public.config_reglas_grupos_culinarios to service_role;

insert into public.config_reglas_grupos_culinarios
  (clave, nombre, terminos, reglas, prioridad, activo)
values
(
  'legumbres_maiz_granos',
  'Legumbres, maíz y granos',
  array['lenteja','lentejas','garbanzo','garbanzos','poroto','porotos','frijol','frijoles','arveja','arvejas','haba','habas','legumbre','legumbres','maiz','choclo','quinoa','avena','cebada','centeno','mijo','trigo burgol','bulgur','grano','granos','arroz','polenta'],
  '{"sinergia":"Usá comino, laurel y pimienta negra como sinergia de condimentos; ajustá la intensidad al plato y a tu tolerancia.","coccion":"Cociná a fuego lento en olla tapada hasta que los ingredientes queden tiernos; mantené un hervor suave.","almidonResistente":"Prepará la porción con antelación, enfriá rápidamente y conservá en heladera durante 12–24 horas antes de recalentarla bien. No dejes la comida horas a temperatura ambiente."}'::jsonb,
  10, true
),
(
  'almidones_pesados',
  'Almidones pesados',
  array['arroz','papa','papas','patata','patatas','batata','boniato','pasta','fideo','fideos','ñoqui','ñoquis','noqui','noquis','mandioca','yuca'],
  '{"timingOrden":"Empezá la ingesta con una porción de vegetales verdes o fibra y después seguí con el alimento con almidón.","almidonResistente":"Priorizá enfriar previamente una porción cocida durante 12–24 horas en heladera y después recalentala bien. Enfriá pronto y conservá de forma segura."}'::jsonb,
  20, true
),
(
  'carnes_grasas_densas',
  'Carnes y grasas densas',
  array['carne','vacuno','ternera','cerdo','pollo','pavo','pescado','atun','atún','salmon','salmón','merluza','cordero','chorizo','panceta','tocino','manteca','grasa vacuna','sebo','crema','crema de leche'],
  '{"coccion":"Sellá la carne en plancha de hierro o Essen usando una cantidad moderada de grasa vacuna (sebo), manteca real u oliva virgen extra; controlá el fuego y evitá quemar la superficie.","sinergia":"Combiná la proteína con ajo, cebolla, orégano, tomillo o jengibre; elegí una combinación breve que encaje con el plato."}'::jsonb,
  30, true
)
on conflict (clave) do update set
  nombre = excluded.nombre,
  terminos = excluded.terminos,
  reglas = excluded.reglas,
  prioridad = excluded.prioridad,
  activo = excluded.activo,
  updated_at = now();
