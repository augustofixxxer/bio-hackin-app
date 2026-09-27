-- Contenido curado para completar la secuencia de la píldora sintomática "Hinchazón".
-- No crea una regla nutricional nueva: reutiliza un protocolo de bienestar
-- ya curado para digestión y lo contextualiza a la intención correspondiente.
insert into public.alternativas_locales (
  id,intencion_principal_id,mecanismo,descripcion_mecanismo,recomendacion,tipo,
  tipo_card,badge_principal,objetivo,accion_texto,observacion_texto,
  continuidad_texto,rol_comercial,prioridad_busqueda,estado_curado
)
select
  'f4c6d8f7-1e5b-4d5f-9b8a-2c7e4a1d6f30'::uuid,
  '9ae78e1e-3fea-438a-8830-ebe197f16b78'::uuid,
  'Caminata suave para observar distensión',
  'Una caminata tranquila después de comer puede servir para explorar cómo cambia la comodidad digestiva en una comida habitual.',
  'Caminá 10 a 15 minutos después de comer, sin convertirlo en entrenamiento.',
  'Protocolo','D','Experimento',array['Bienestar Digestivo y Cocina Casera'],
  'Probá una caminata tranquila después de una comida que conozcas bien.',
  'Observá comodidad, pesadez o distensión durante la hora siguiente.',
  'Repetilo con comidas parecidas y compará.','hack',30,'conservar'
where not exists (select 1 from public.alternativas_locales where id='f4c6d8f7-1e5b-4d5f-9b8a-2c7e4a1d6f30'::uuid);