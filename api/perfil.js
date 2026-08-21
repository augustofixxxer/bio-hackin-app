// api/perfil.js
// Consolidación de deploy (19/08/2026) — mismo criterio que premium.js. Fusiona
// actualizar-nombre.js y actualizar-objetivo.js. CERO cambio de lógica, mismo código
// de cada uno, solo bajo un router por query param (?campo=).
//
// Rutas:
//   POST /api/perfil?campo=nombre    (antes: actualizar-nombre.js)
//   POST /api/perfil?campo=objetivo  (antes: actualizar-objetivo.js)

import { emitirEvento } from "./_instrumentacion.js";
import { supabaseFetch, SUPABASE_URL, SUPABASE_KEY } from "./_supabase.js";
import { usuarioIdDesdeRequest } from "./_sesion.js";

const GRUPOS_VALIDOS = ["bajar_peso", "energia_foco", "rendimiento_fisico", "sentirme_mejor"];

// ===== campo=nombre (idéntico a actualizar-nombre.js) =====
async function campoNombre(req, res, usuarioId) {
  const { nombreAlias } = req.body || {};
  if (!nombreAlias || typeof nombreAlias !== "string" || nombreAlias.trim().length === 0) {
    return res.status(400).json({ error: "Falta nombreAlias." });
  }
  const nombreLimpio = nombreAlias.trim().slice(0, 80);

  try {
    await supabaseFetch(`usuarios?id=eq.${usuarioId}`, {
      method: "PATCH",
      body: JSON.stringify({ nombre_alias: nombreLimpio }),
    });

    await emitirEvento({
      usuarioId,
      eventType: "nombre_actualizado_onboarding",
      sourceComponent: "perfil",
      requestingComponent: "perfil",
      payload: {},
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Error en perfil?campo=nombre:", err);
    return res.status(500).json({ error: "Error actualizando el nombre", detail: String(err) });
  }
}

// ===== campo=objetivo (idéntico a actualizar-objetivo.js) =====
async function campoObjetivo(req, res, usuarioId) {
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
      sourceComponent: "perfil",
      requestingComponent: "perfil",
      payload: { objetivoGrupo },
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Error en perfil?campo=objetivo:", err);
    return res.status(500).json({ error: "Error guardando el objetivo", detail: String(err) });
  }
}

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

  const campo = req.query?.campo;
  if (campo === "nombre") return campoNombre(req, res, usuarioId);
  if (campo === "objetivo") return campoObjetivo(req, res, usuarioId);
  return res.status(400).json({ error: "Falta ?campo= válido (nombre | objetivo)." });
}
// END: /api/perfil.js
