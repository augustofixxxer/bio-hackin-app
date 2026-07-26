// api/actualizar-nombre.js
// Recibe POST con { usuarioId, nombreAlias } y actualiza usuarios.nombre_alias.
// Usado por el Paso 1 del Onboarding (Identificación). No es una condición de acceso:
// si falla, el Onboarding sigue adelante igual (ver OnboardingFlow en index.html).

import { emitirEvento } from "./_instrumentacion.js";
import { supabaseFetch, SUPABASE_URL, SUPABASE_KEY } from "./_supabase.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function esUUIDValido(valor) {
  return typeof valor === "string" && UUID_REGEX.test(valor);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido, usar POST." });
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: "Falta configurar SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY." });
  }

  const { usuarioId, nombreAlias } = req.body || {};
  if (!usuarioId || !esUUIDValido(usuarioId)) {
    return res.status(400).json({ error: "usuarioId inválido." });
  }
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
