// api/actualizar-nombre.js
// Recibe POST con { pase, nombreAlias } y actualiza usuarios.nombre_alias.
// Usado por el Paso 1 del Onboarding (Identificación). No es una condición de acceso:
// si falla, el Onboarding sigue adelante igual (ver OnboardingFlow en index.html).
//
// AUTENTICACIÓN REAL DE SESIÓN (29/07/2026): el usuarioId ya NO se toma del body —
// se extrae del "pase" firmado (ver _sesion.js). Si el pase no es válido, 401.

import { emitirEvento } from "./_instrumentacion.js";
import { supabaseFetch, SUPABASE_URL, SUPABASE_KEY } from "./_supabase.js";
import { usuarioIdDesdeRequest } from "./_sesion.js";

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

  const { nombreAlias } = req.body || {};
  if (!nombreAlias || typeof nombreAlias !== "string" || nombreAlias.trim().length === 0) {
    return res.status(400).json({ error: "Falta nombreAlias." });
  }
  const nombreLimpio = nombreAlias.trim().slice(0, 80); // límite razonable, evita abuso

  try {
    await supabaseFetch(`usuarios?id=eq.${usuarioId}`, {
      method: "PATCH",
      body: JSON.stringify({ nombre_alias: nombreLimpio }),
    });

    await emitirEvento({
      usuarioId,
      eventType: "nombre_actualizado_onboarding",
      sourceComponent: "actualizar-nombre",
      requestingComponent: "actualizar-nombre",
      payload: {},
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Error en actualizar-nombre:", err);
    return res.status(500).json({ error: "Error actualizando el nombre", detail: String(err) });
  }
}
// END: /api/actualizar-nombre.js
