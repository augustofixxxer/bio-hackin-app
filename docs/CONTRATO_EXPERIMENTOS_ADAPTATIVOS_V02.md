# Contrato de datos: experimentos adaptativos v02

## Alcance
Define la persistencia para variables experimentales dinámicas. No modifica el motor de tendencias/bienestar de 10 días ni calcula causalidad.

## Campos nuevos en `premium_experimentos`

- `tipo_variable` (text, obligatorio): clave estable de la variable, por ejemplo `coccion`, `temperatura`, `almidon` o `timing`.
- `condicion_aplicada` (jsonb, obligatorio): objeto con variantes `a` y `b`. Cada variante puede ser una etiqueta breve o un objeto, recomendado:
  ```json
  {
    "a": { "etiqueta": "Al horno", "parametros": { "temperatura_c": 200, "duracion_min": 20 } },
    "b": { "etiqueta": "Hervido", "parametros": { "duracion_min": 15 } }
  }
  ```
- `contexto_tarjeta` (jsonb, opcional): contexto de origen enviado por la tarjeta, por ejemplo:
  ```json
  {
    "tarjeta": "comparacion",
    "id": "identificador-de-origen",
    "variable": "coccion",
    "hipotesis": "Comparar tolerancia percibida entre métodos",
    "hallazgo": "texto o dato de origen"
  }
  ```
- `resultado_cualitativo` (jsonb, objeto con default `{}`): observaciones por variante, por ejemplo:
  ```json
  {
    "a": { "observacion": "Menos pesadez", "escala": "subjetiva" },
    "b": { "observacion": "Más pesadez", "escala": "subjetiva" }
  }
  ```

## API `POST /api/premium?ruta=experimento`

Crear:
```json
{
  "accion": "crear",
  "titulo": "Comparación personal",
  "tipoVariable": "coccion",
  "condicionAplicada": {
    "a": { "etiqueta": "Al horno", "parametros": { "temperatura_c": 200 } },
    "b": { "etiqueta": "Hervido", "parametros": {} }
  },
  "contextoTarjeta": {
    "tarjeta": "sugerencia",
    "id": "origen-id",
    "variable": "coccion",
    "hipotesis": "Evaluar tolerancia percibida"
  }
}
```

Registrar resultado:
```json
{
  "accion": "registrar",
  "experimentoId": "uuid",
  "lado": "a",
  "resultadoCualitativo": {
    "observacion": "Me sentí menos pesado",
    "momento": "2 horas después"
  }
}
```

Los registros nuevos actualizan `resultado_cualitativo.a` o `.b` y mantienen `registro_a`/`registro_b` como puente de compatibilidad. El cliente anterior sigue pudiendo enviar `opcionA`, `opcionB`, `registroA` o `registroB`; el backend los normaliza al contrato estructurado.

## Reglas de integridad y compatibilidad
- Se exige que `condicion_aplicada` incluya ambas variantes.
- `contexto_tarjeta.tarjeta`, si se informa, solo admite `hallazgo`, `sugerencia` o `comparacion`.
- `opcion_a`, `opcion_b`, `registro_a` y `registro_b` no se eliminan en esta fase porque existen clientes y registros previos.
- La API no declara ganador ni infiere causalidad; solo persiste condiciones y observaciones.
- El motor de tendencias de 10 días permanece intacto.
