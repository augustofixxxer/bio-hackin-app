// api/aceptar-terminos.js
// Recibe POST con { pase, condicionMedica? } y:
// 1) marca terminos_aceptados = true en usuarios (guarda condicion_medica_preexistente si vino)
// 2) crea un registro inmutable en "log_aceptacion_terminos" con fecha UTC, versión e IP.
//
// AUTENTICACIÓN REAL DE SESIÓN (29/07/2026): el usuarioId ya NO se toma del body —
// se extrae del "pase" firmado (ver _sesion.js). Si el pase no es válido, 401.

import { usuarioIdDesdeRequest } from "./_sesion.js";
import { supabaseFetch, SUPABASE_URL, SUPABASE_KEY } from "./_supabase.js";

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

  const usuarioId = usuarioIdDesdeRequest(req);
  if (!usuarioId) {
    return res.status(401).json({ error: "Sesión inválida o vencida. Volvé a iniciar sesión." });
  }

  const { condicionMedica } = req.body || {};

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

    const yaRegistrada = await supabaseFetch(
      `log_aceptacion_terminos?usuario_id=eq.${usuarioId}&version_terminos=eq.${encodeURIComponent(VERSION_TERMINOS_ACTUAL)}&select=id&limit=1`
    );
    if (!yaRegistrada.length) {
      await supabaseFetch(`log_aceptacion_terminos`, {
        method: "POST",
        body: JSON.stringify({
          usuario_id: usuarioId,
          fecha_utc: new Date().toISOString(),
          version_terminos: VERSION_TERMINOS_ACTUAL,
          ip_address: ip,
        }),
      });
    }

    return res.status(200).json({ ok: true, version: VERSION_TERMINOS_ACTUAL });
  } catch (err) {
    console.error("Error en aceptar-terminos:", err);
    return res.status(500).json({ error: "Error registrando la aceptación de términos" });
  }
}
// END: /api/aceptar-terminos.js
