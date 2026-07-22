// api/_trazabilidad.js
// MIS — Etapa 2: Integración de Trazabilidad
// Componente de consulta de solo lectura (D2-04). Desacoplado de la lógica funcional (D2-05).
// Reutiliza exclusivamente las tablas y relaciones ya aprobadas (D2-01) — sin tablas nuevas,
// sin heurísticas de reconstrucción (D2-02). Patrón de archivo único (lección Sprint 16).
//
// Topología oficial (RA-011): grafo, no cadena lineal.
//   Evento → REA → Acción → Concesión ─┬─► Capacidad
//                              │        ├─► Sujeto
//                              │        └─► Contexto de Autorización
//                              └───────────► Contexto de Ejecución (vía Acción/REA)
//
// DC-10: toda consulta debe identificar explícitamente los 8 nodos, incluyendo ambos
// Contextos por separado. Si difieren, se preservan íntegros; si coinciden, se indica.
// D2-03: un vínculo faltante o inconsistente es un ERROR de trazabilidad — no se swallea
// como en _instrumentacion.js (ese componente prioriza no-intrusión; este prioriza
// exactitud de auditoría, son responsabilidades distintas).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

class ErrorTrazabilidad extends Error {
  constructor(eslabon, detalle) {
    super(`Error de trazabilidad en "${eslabon}": ${detalle}`);
    this.name = "ErrorTrazabilidad";
    this.eslabon = eslabon;
  }
}

async function supabaseFetch(path) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
  });
  const text = await resp.text();
  const data = text ? JSON.parse(text) : null;
  if (!resp.ok) {
    throw new Error((data && (data.message || data.error)) || `Supabase respondió ${resp.status}`);
  }
  return data;
}

async function obtenerUno(path, eslabon) {
  const rows = await supabaseFetch(path);
  if (!rows || rows.length === 0) {
    throw new ErrorTrazabilidad(eslabon, "vínculo faltante — ninguna fila encontrada");
  }
  return rows[0];
}

/**
 * Reconstruye el árbol de evidencia completo de un evento (DC-11), utilizando
 * únicamente información persistida (criterio de aceptación DAE-02 §7).
 * Solo lectura. Lanza ErrorTrazabilidad si algún eslabón falta o es inconsistente.
 */
async function reconstruirTrazabilidadEvento(eventId) {
  if (!eventId) throw new ErrorTrazabilidad("Evento", "eventId no provisto");

  const evento = await obtenerUno(
    `eventos_instrumentacion?event_id=eq.${eventId}&select=*`,
    "Evento"
  );

  const rea = await obtenerUno(
    `rea?evidence_id=eq.${evento.evidence_id}&select=*`,
    "REA"
  );

  const accion = await obtenerUno(
    `acciones?action_id=eq.${rea.action_id}&select=*`,
    "Acción"
  );

  const concesion = await obtenerUno(
    `concesiones?grant_id=eq.${accion.grant_id}&select=*`,
    "Concesión"
  );

  const capacidad = await obtenerUno(
    `capacidades?capability_id=eq.${concesion.capability_id}&select=*`,
    "Capacidad"
  );

  const sujeto = await obtenerUno(
    `sujetos?subject_id=eq.${accion.subject_id}&select=*`,
    "Sujeto"
  );

  // Consistencia (Criterios de Auditoría DAE-02 §8): la Acción y la Concesión
  // deben referir al mismo Sujeto — si no, es una relación huérfana/inconsistente.
  if (accion.subject_id !== concesion.subject_id) {
    throw new ErrorTrazabilidad(
      "Sujeto",
      `inconsistencia: Acción.subject_id (${accion.subject_id}) != Concesión.subject_id (${concesion.subject_id})`
    );
  }

  // REA y Acción deben compartir el mismo Contexto de Ejecución (así se escriben
  // en _instrumentacion.js — un desvío acá es una anomalía de trazabilidad).
  if (rea.context_id !== accion.context_id) {
    throw new ErrorTrazabilidad(
      "Contexto de Ejecución",
      `inconsistencia: REA.context_id (${rea.context_id}) != Acción.context_id (${accion.context_id})`
    );
  }

  const contextoAutorizacion = await obtenerUno(
    `contextos?context_id=eq.${concesion.context_id}&select=*`,
    "Contexto de Autorización"
  );

  const contextoEjecucion = await obtenerUno(
    `contextos?context_id=eq.${accion.context_id}&select=*`,
    "Contexto de Ejecución"
  );

  const contextosCoinciden = contextoAutorizacion.context_id === contextoEjecucion.context_id;

  // DC-10: los 8 nodos, explícitos, sin colapsar los dos Contextos.
  return {
    evento,
    rea,
    accion,
    concesion,
    capacidad,
    sujeto,
    contextoAutorizacion,
    contextoEjecucion,
    contextosCoinciden,
  };
}

export { reconstruirTrazabilidadEvento, ErrorTrazabilidad };
