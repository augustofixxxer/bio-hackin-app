// api/registrar-consentimiento-riesgo.js
// Recibe POST con { usuarioId, bloqueo, nivelRiesgo } y crea un log inmutable
// cada vez que un usuario confirma haber leído un bloqueo de riesgo Medio/Alto/Experimental.

// MIS Etapa 2 — Integración de Trazabilidad. No intrusivo: emitirEvento nunca lanza,
// un fallo interno se loguea y se descarta (mismo patrón que registrar-comida.js).
// Especialmente valioso acá: es evidencia de que un riesgo Medio/Alto/Experimental
// fue reconocido por el usuario — refuerza el blindaje legal ya existente en el log.
import { emitirEvento } from "./_instrumentacion.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Sprint "Sanitización" — usuarioId acá no se interpola en una URL (va en el body
// del POST), así que no hay riesgo de inyección de query. Se valida igual como UUID
// por consistencia de datos: evita que basura llegue a log_consentimiento_riesgo.usuario_id.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function esUUIDValido(valor) {
  return typeof valor === "string" && UUID_REGEX.test(valor);
}

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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido, usar POST." });
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: "Falta configurar SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY." });
  }

  const { usuarioId, bloqueo, nivelRiesgo } = req.body || {};
  if (!usuarioId || !bloqueo || !nivelRiesgo) {
    return res.status(400).json({ error: "Faltan datos (usuarioId, bloqueo, nivelRiesgo)." });
  }
  if (!esUUIDValido(usuarioId)) {
    return res.status(400).json({ error: "usuarioId inválido." });
  }

  try {
    await supabaseFetch(`log_consentimiento_riesgo`, {
      method: "POST",
      body: JSON.stringify({
        usuario_id: usuarioId,
        bloqueo_regla: bloqueo,
        nivel_riesgo: nivelRiesgo,
        fecha: new Date().toISOString(),
      }),
    });
    await emitirEvento({
      usuarioId,
      eventType: "consentimiento_riesgo_registrado",
      sourceComponent: "registrar-consentimiento-riesgo",
      requestingComponent: "registrar-consentimiento-riesgo",
      payload: { bloqueo, nivelRiesgo },
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Error en registrar-consentimiento-riesgo:", err);
    return res.status(500).json({ error: "Error registrando el consentimiento", detail: String(err) });
  }
}
// END: /api/registrar-consentimiento-riesgo.js
