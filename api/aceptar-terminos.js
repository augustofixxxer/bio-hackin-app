// api/aceptar-terminos.js
// Recibe POST con { usuarioId, condicionMedica? } y:
// 1) marca terminos_aceptados = true en usuarios (guarda condicion_medica_preexistente si vino)
// 2) crea un registro inmutable en "log_aceptacion_terminos" con fecha UTC, versión e IP.

// MIS Etapa 2 — Integración de Trazabilidad. No intrusivo: emitirEvento nunca lanza,
// un fallo interno se loguea y se descarta (mismo patrón que registrar-comida.js).
import { emitirEvento } from "./_instrumentacion.js";
// BT-02 — conexión a Supabase unificada (ver api/_supabase.js).
import { supabaseFetch, SUPABASE_URL, SUPABASE_KEY } from "./_supabase.js";

// Sprint "Sanitización" — usuarioId siempre debe validarse como UUID antes de
// interpolarlo en una URL de PostgREST (evita inyección vía query string).
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function esUUIDValido(valor) {
  return typeof valor === "string" && UUID_REGEX.test(valor);
}

// Subí este número cada vez que cambies el texto legal de los Términos —
// así el log queda trazable a qué versión aceptó cada usuario.
const VERSION_TERMINOS_ACTUAL = "1.0";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido, usar POST." });
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: "Falta configurar SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY." });
  }

  const { usuarioId, condicionMedica } = req.body || {};
  if (!usuarioId || typeof usuarioId !== "string") {
    return res.status(400).json({ error: "Falta usuarioId." });
  }
  if (!esUUIDValido(usuarioId)) {
    return res.status(400).json({ error: "usuarioId inválido." });
  }

  const ipHeader = req.headers["x-forwarded-for"] || "";
  const ip = String(ipHeader).split(",")[0].trim() || req.socket?.remoteAddress || "desconocida";

  try {
    await supabaseFetch(`usuarios?id=eq.${usuarioId}`, {
      method: "PATCH",
      body: JSON.stringify({
        terminos_aceptados: true,
        ...(typeof condicionMedica === "boolean" ? { condicion_medica_preexistente: condicionMedica } : {}),
      }),
    });

    await supabaseFetch(`log_aceptacion_terminos`, {
      method: "POST",
      body: JSON.stringify({
        usuario_id: usuarioId,
        fecha_utc: new Date().toISOString(),
        version_terminos: VERSION_TERMINOS_ACTUAL,
        ip_address: ip,
      }),
    });

    await emitirEvento({
      usuarioId,
      eventType: "terminos_aceptados",
      sourceComponent: "aceptar-terminos",
      requestingComponent: "aceptar-terminos",
      payload: { version: VERSION_TERMINOS_ACTUAL },
    });

    return res.status(200).json({ ok: true, version: VERSION_TERMINOS_ACTUAL });
  } catch (err) {
    console.error("Error en aceptar-terminos:", err);
    return res.status(500).json({ error: "Error registrando la aceptación de términos", detail: String(err) });
  }
}
// END: /api/aceptar-terminos.js
