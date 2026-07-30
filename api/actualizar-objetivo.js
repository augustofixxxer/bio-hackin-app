// api/actualizar-objetivo.js
// Recibe POST con { pase, objetivoGrupo } y guarda usuarios.objetivo_grupo.
// Usado por ObjetivoGate (Home orientado a objetivo, 30/07/2026) — se muestra
// una sola vez, después del Onboarding y antes de entrar a la app. Mismo
// patrón que actualizar-nombre.js (mismo tipo de campo, mismo tipo de gate).
//
// AUTENTICACIÓN REAL DE SESIÓN: el usuarioId se extrae del pase firmado, igual
// que el resto de los endpoints protegidos (ver _sesion.js).

import { emitirEvento } from "./_instrumentacion.js";
import { supabaseFetch, SUPABASE_URL, SUPABASE_KEY } from "./_supabase.js";
import { usuarioIdDesdeRequest } from "./_sesion.js";

const GRUPOS_VALIDOS = ["bajar_peso", "energia_foco", "rendimiento_fisico", "sentirme_mejor"];

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

  const { objetivoGrupo } = req.body || {};
  if (!GRUPOS_VALIDOS.includes(objetivoGrupo)) {
    return res.status(400).json({ error: "objetivoGrupo inválido." });
  }

  try {
    await supabaseFetch(`usuarios?id=eq.${usuarioId}`, {
      method: "PATCH",
      body: JSON.stringify({ objetivo_grupo: objetivoGrupo }),
    });

    await emitirEvento({
      usuarioId,
      eventType: "objetivo_actualizado",
      sourceComponent: "actualizar-objetivo",
      requestingComponent: "actualizar-objetivo",
      payload: { objetivoGrupo },
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Error en actualizar-objetivo:", err);
    return res.status(500).json({ error: "Error guardando el objetivo", detail: String(err) });
  }
}
// END: /api/actualizar-objetivo.js
