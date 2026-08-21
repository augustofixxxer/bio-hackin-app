// api/registrar-extra.js
// Consolidación de deploy (19/08/2026) — mismo criterio que premium.js/perfil.js.
// Fusiona registrar-consentimiento-riesgo.js y registrar-reaccion.js. CERO cambio de
// lógica, mismo código de cada uno, solo bajo un router por query param (?tipo=).
//
// Rutas:
//   POST /api/registrar-extra?tipo=consentimiento-riesgo            (antes: registrar-consentimiento-riesgo.js)
//   GET  /api/registrar-extra?tipo=reaccion&alternativaId=<uuid>    (antes: registrar-reaccion.js, CTA3)
//   POST /api/registrar-extra?tipo=reaccion                         (antes: registrar-reaccion.js, CTA1)

import { usuarioIdDesdeRequest } from "./_sesion.js";
import { supabaseFetch, SUPABASE_URL, SUPABASE_KEY } from "./_supabase.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OCURRENCIAS_MINIMAS = 2;
const DIFERENCIA_MINIMA = 1;
const VALORES_FRIO_CALOR = ["Fresco", "Cálido"];
const VALORES_LIVIANO_PESADO = ["Liviano", "Pesado"];

// ===== tipo=consentimiento-riesgo (idéntico a registrar-consentimiento-riesgo.js) =====
async function tipoConsentimientoRiesgo(req, res, usuarioId) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido, usar POST." });
  }
  const { bloqueo, nivelRiesgo } = req.body || {};
  if (!bloqueo || !nivelRiesgo) {
    return res.status(400).json({ error: "Faltan datos (bloqueo, nivelRiesgo)." });
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
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Error en registrar-extra?tipo=consentimiento-riesgo:", err);
    return res.status(500).json({ error: "Error registrando el consentimiento", detail: String(err) });
  }
}

// Blindaje legal: mismo chequeo que patrones-observacionales.js y registrar-comida.js.
async function verificarAcceso(usuarioId) {
  const rows = await supabaseFetch(`usuarios?id=eq.${usuarioId}&select=cuenta_suspendida,terminos_aceptados`);
  if (!rows.length) return { ok: false, status: 404, error: "Usuario no encontrado." };
  const u = rows[0];
  if (u.cuenta_suspendida === true) {
    return { ok: false, status: 403, error: "Esta cuenta fue suspendida. Contactanos si creés que es un error." };
  }
  if (u.terminos_aceptados !== true) {
    return { ok: false, status: 403, error: "Debés aceptar los Términos y Condiciones para continuar.", requiereTerminos: true };
  }
  return { ok: true };
}

// ===== tipo=reaccion (idéntico a registrar-reaccion.js) =====
async function tipoReaccion(req, res, usuarioId) {
  if (!UUID_REGEX.test(usuarioId)) {
    return res.status(400).json({ error: "usuarioId inválido." });
  }
  try {
    const acceso = await verificarAcceso(usuarioId);
    if (!acceso.ok) {
      return res.status(acceso.status).json({ error: acceso.error, requiereTerminos: acceso.requiereTerminos });
    }
  } catch (err) {
    return res.status(400).json({ error: "El usuarioId recibido no es válido.", detail: String(err) });
  }

  if (req.method === "GET") {
    const alternativaId = req.query?.alternativaId;
    if (!alternativaId || !UUID_REGEX.test(alternativaId)) {
      return res.status(400).json({ error: "Falta alternativaId válido." });
    }
    try {
      const [reaccionRows, comidas, bienestares] = await Promise.all([
        supabaseFetch(`reacciones_alternativas?usuario_id=eq.${usuarioId}&alternativa_id=eq.${alternativaId}&select=frio_calor,liviano_pesado,updated_at`),
        supabaseFetch(`registro_diario_real?usuario_id=eq.${usuarioId}&alternativa_id=eq.${alternativaId}&select=fecha`),
        supabaseFetch(`bienestar_diario_real?usuario_id=eq.${usuarioId}&select=fecha_hora,energia,digestion`),
      ]);

      const fechasConAlternativa = new Set(comidas.map((c) => c.fecha));

      function calcularPatronMetrica(campo) {
        const promedioPorFecha = {};
        const conteoPorFecha = {};
        for (const b of bienestares) {
          if (b[campo] === null || b[campo] === undefined) continue;
          const fecha = String(b.fecha_hora).slice(0, 10);
          promedioPorFecha[fecha] = (promedioPorFecha[fecha] || 0) + b[campo];
          conteoPorFecha[fecha] = (conteoPorFecha[fecha] || 0) + 1;
        }
        for (const fecha of Object.keys(promedioPorFecha)) {
          promedioPorFecha[fecha] = promedioPorFecha[fecha] / conteoPorFecha[fecha];
        }
        const grupoCon = [...fechasConAlternativa].filter((f) => promedioPorFecha[f] !== undefined).map((f) => promedioPorFecha[f]);
        const grupoBase = Object.entries(promedioPorFecha).filter(([fecha]) => !fechasConAlternativa.has(fecha)).map(([, v]) => v);
        if (grupoCon.length < OCURRENCIAS_MINIMAS || grupoBase.length < 1) return null;
        const promedioCon = grupoCon.reduce((a, b) => a + b, 0) / grupoCon.length;
        const promedioBase = grupoBase.reduce((a, b) => a + b, 0) / grupoBase.length;
        if (Math.abs(promedioCon - promedioBase) < DIFERENCIA_MINIMA) return null;
        return {
          promedioConAlternativa: Math.round(promedioCon * 10) / 10,
          promedioGeneral: Math.round(promedioBase * 10) / 10,
          ocurrencias: grupoCon.length,
        };
      }

      const patron = {
        energia: calcularPatronMetrica("energia"),
        digestion: calcularPatronMetrica("digestion"),
      };

      return res.status(200).json({ reaccion: reaccionRows[0] || null, patron });
    } catch (err) {
      return res.status(500).json({ error: "Error leyendo la reacción", detail: String(err) });
    }
  }

  if (req.method === "POST") {
    const { alternativaId, frioCalor, livianoPesado } = req.body || {};
    if (!alternativaId || !UUID_REGEX.test(alternativaId)) {
      return res.status(400).json({ error: "Falta alternativaId válido." });
    }
    if (!VALORES_FRIO_CALOR.includes(frioCalor) && !VALORES_LIVIANO_PESADO.includes(livianoPesado)) {
      return res.status(400).json({ error: "Falta al menos un valor válido (frioCalor o livianoPesado)." });
    }
    if (frioCalor && !VALORES_FRIO_CALOR.includes(frioCalor)) {
      return res.status(400).json({ error: "frioCalor inválido." });
    }
    if (livianoPesado && !VALORES_LIVIANO_PESADO.includes(livianoPesado)) {
      return res.status(400).json({ error: "livianoPesado inválido." });
    }
    try {
      const body = {
        usuario_id: usuarioId,
        alternativa_id: alternativaId,
        updated_at: new Date().toISOString(),
        ...(frioCalor ? { frio_calor: frioCalor } : {}),
        ...(livianoPesado ? { liviano_pesado: livianoPesado } : {}),
      };
      const creado = await supabaseFetch(`reacciones_alternativas?on_conflict=usuario_id,alternativa_id`, {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(body),
      });
      return res.status(200).json({ reaccion: creado[0] });
    } catch (err) {
      return res.status(500).json({ error: "Error guardando la reacción", detail: String(err) });
    }
  }

  return res.status(405).json({ error: "Método no permitido, usar GET o POST." });
}

export default async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: "Falta configurar SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY." });
  }

  const usuarioId = usuarioIdDesdeRequest(req);
  if (!usuarioId) {
    return res.status(401).json({ error: "Sesión inválida o vencida. Volvé a iniciar sesión." });
  }

  const tipo = req.query?.tipo;
  if (tipo === "consentimiento-riesgo") return tipoConsentimientoRiesgo(req, res, usuarioId);
  if (tipo === "reaccion") return tipoReaccion(req, res, usuarioId);
  return res.status(400).json({ error: "Falta ?tipo= válido (consentimiento-riesgo | reaccion)." });
}
// END: /api/registrar-extra.js
