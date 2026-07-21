// api/_instrumentacion.js
// MIS — Etapa 1: Instrumentación Base — Componente único de emisión (Directiva 3, DAE-01)
// Patrón de archivo único (lección Sprint 16) — NO separar en lib/, NO importar entre carpetas.
// Prefijo "_" para no exponerse como endpoint HTTP propio en Vercel.
// Sintaxis ESM (export), coherente con el resto de api/*.js (ej. registrar-comida.js usa "export default").

// ============================================================
// SECCIÓN 1 — MOTOR PURO (RA-007 / DC-07)
// Sin I/O, sin efectos secundarios, sin dependencia de framework/entorno.
// Única responsabilidad: construir y validar el envelope del evento
// conforme al Contrato de Eventos (Sprint 21, mapeo RA-AET-01).
// ============================================================

const CONTRACT_VERSION_ACTUAL = "1.0"; // versión vigente del Contrato de Eventos

function construirEnvelopeEvento({ eventType, sourceComponent, payload }) {
  if (!eventType || typeof eventType !== "string") {
    throw new Error("construirEnvelopeEvento: eventType es obligatorio y debe ser string");
  }
  if (!sourceComponent || typeof sourceComponent !== "string") {
    throw new Error("construirEnvelopeEvento: sourceComponent es obligatorio y debe ser string");
  }
  return {
    event_type: eventType,
    source_component: sourceComponent,
    contract_version: CONTRACT_VERSION_ACTUAL,
    event_status: "Pendiente", // catálogo RA-004
    payload_reference: payload ?? null,
  };
}

// ============================================================
// SECCIÓN 2 — CAPA DE ACCESO (RA-006 / DC-06)
// Toda interacción con infraestructura vive exclusivamente acá,
// nunca en la Sección 1 (RA-007).
// Orquestación oficial (DC-06):
//   Sujeto → reutiliza o crea · Capacidad → debe existir (semilla) ·
//   Concesión → reutiliza vigente por Sujeto+Capacidad · Contexto → nuevo por ejecución ·
//   Acción → nueva por ejecución · REA → nuevo por Acción · Evento → nuevo por REA.
// ============================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Nombre de la Capacidad semilla requerida (RA-006 Punto 1). Debe existir previamente,
// creada manualmente con aprobación del Fundador — este componente NUNCA la crea.
const CAPABILITY_NAME = "registrar_evento_instrumentacion";

async function supabaseFetch(path, options = {}) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await resp.text();
  const data = text ? JSON.parse(text) : null;
  if (!resp.ok) {
    throw new Error((data && (data.message || data.error)) || `Supabase respondió ${resp.status}`);
  }
  return data;
}

async function resolverSujeto(usuarioId) {
  const map = await supabaseFetch(`usuario_subject_map?usuario_id=eq.${usuarioId}&select=subject_id`);
  if (map.length > 0) return map[0].subject_id;

  const sujeto = await supabaseFetch(`sujetos`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ subject_type: "usuario" }),
  });
  const subjectId = sujeto[0].subject_id;

  await supabaseFetch(`usuario_subject_map`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ usuario_id: usuarioId, subject_id: subjectId }),
  });

  return subjectId;
}

async function resolverCapacidad() {
  const rows = await supabaseFetch(
    `capacidades?name=eq.${CAPABILITY_NAME}&select=capability_id`
  );
  if (rows.length === 0) {
    // RA-006 Punto 1: esta Capacidad debe existir como semilla. Si no existe, no se crea acá.
    throw new Error(
      `Capacidad semilla "${CAPABILITY_NAME}" no encontrada. Debe crearse manualmente antes de usar este componente.`
    );
  }
  return rows[0].capability_id;
}

async function crearContexto({ executionOrigin, requestingComponent, executionScope }) {
  const rows = await supabaseFetch(`contextos`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      execution_origin: executionOrigin,
      requesting_component: requestingComponent,
      execution_scope: executionScope,
      status: "Confirmado",
    }),
  });
  return rows[0].context_id;
}

async function resolverConcesionVigente(subjectId, capabilityId, contextIdParaEmision) {
  const rows = await supabaseFetch(
    `concesiones?subject_id=eq.${subjectId}&capability_id=eq.${capabilityId}&status=eq.vigente&select=grant_id`
  );
  if (rows.length > 0) return rows[0].grant_id;

  const nueva = await supabaseFetch(`concesiones`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      subject_id: subjectId,
      capability_id: capabilityId,
      context_id: contextIdParaEmision,
      status: "vigente",
      issued_at: new Date().toISOString(),
    }),
  });
  return nueva[0].grant_id;
}

async function crearAccion({ subjectId, grantId, contextId, actionType, result }) {
  const rows = await supabaseFetch(`acciones`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      subject_id: subjectId,
      grant_id: grantId,
      context_id: contextId,
      action_type: actionType,
      result,
    }),
  });
  return rows[0].action_id;
}

async function crearREA({ actionId, grantId, contextId, validationResult }) {
  const rows = await supabaseFetch(`rea`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      action_id: actionId,
      grant_id: grantId,
      context_id: contextId,
      validation_result: validationResult,
      validated_at: new Date().toISOString(),
    }),
  });
  return rows[0].evidence_id;
}

async function insertarEvento(envelope, evidenceId) {
  await supabaseFetch(`eventos_instrumentacion`, {
    method: "POST",
    body: JSON.stringify({ ...envelope, evidence_id: evidenceId }),
  });
}

/**
 * Punto único de emisión (Directiva 3). No intrusivo (Directiva 2):
 * cualquier fallo se loguea y se descarta, nunca interrumpe al llamador.
 */
async function emitirEvento({ usuarioId, eventType, sourceComponent, payload, requestingComponent }) {
  try {
    if (!SUPABASE_URL || !SUPABASE_KEY) return; // sin config, no intenta
    if (!usuarioId) return; // política: sin usuarioId no hay Sujeto atribuible, se omite (no bloquea)

    const subjectId = await resolverSujeto(usuarioId);
    const capabilityId = await resolverCapacidad();
    const contextId = await crearContexto({
      executionOrigin: "api",
      requestingComponent: requestingComponent || sourceComponent,
      executionScope: eventType,
    });
    const grantId = await resolverConcesionVigente(subjectId, capabilityId, contextId);
    const actionId = await crearAccion({
      subjectId,
      grantId,
      contextId,
      actionType: eventType,
      result: "ok",
    });
    const evidenceId = await crearREA({ actionId, grantId, contextId, validationResult: "validado" });

    const envelope = construirEnvelopeEvento({ eventType, sourceComponent, payload });
    await insertarEvento(envelope, evidenceId);
  } catch (err) {
    console.error("[instrumentacion] fallo no bloqueante:", err);
  }
}

export { construirEnvelopeEvento, emitirEvento };
