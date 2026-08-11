// api/registrar-reaccion.js
// Fase 2 (10/08/2026) — CTA1 "¿Cómo te cae?" (POST, upsert) y CTA3 "¿Y esto en mi caso?" (GET).
//
// Guarda/lee la reacción personal del usuario a una Alternativa Local puntual
// (Fresco/Cálido + Liviano/Pesado). No existía ningún endpoint ni tabla para esto —
// patrones-observacionales.js es de solo lectura y no está atado a un alternativa_id
// puntual (ver auditoría 10/08/2026). Tabla nueva: reacciones_alternativas, autorizada
// por el Fundador.
//
// GET  = CTA3: devuelve la última reacción marcada para esa alternativa (o null).
// POST = CTA1: upsert por (usuario_id, alternativa_id) — guarda el ÚLTIMO estado
// marcado, no un historial acumulado (así lo pidió Marketing explícitamente).
//
// Mismo patrón same-folder que el resto (Sprint 16: nunca separar en /lib).

import { usuarioIdDesdeRequest } from "./_sesion.js";
import { supabaseFetch, SUPABASE_URL, SUPABASE_KEY } from "./_supabase.js";

// Fase 4 (10/08/2026) — cruce CTA3 con bienestar. MISMO umbral que patrones-observacionales.js
// (2 ocurrencias + diferencia >= 1 punto en energía, escala 1-5) — reusado literal, no
// reinventado. Compara el mismo día que se sumó la alternativa (no el día siguiente: ese
// desfasaje es específico de la teoría harinas-cena→energía de patrones-observacionales.js,
// no un default general para cualquier alternativa).
const OCURRENCIAS_MINIMAS = 2;
const DIFERENCIA_MINIMA = 1;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

const VALORES_FRIO_CALOR = ["Fresco", "Cálido"];
const VALORES_LIVIANO_PESADO = ["Liviano", "Pesado"];

export default async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: "Falta configurar SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY." });
  }

  // CTA1/CTA3 son de "Mis Patrones" — requieren usuario con cuenta, no hay registro anónimo acá
  // (a diferencia de registrar-comida.js). Sin usuarioId no hay nada personal que leer ni guardar.
  const usuarioId = usuarioIdDesdeRequest(req);
  if (!usuarioId) {
    return res.status(401).json({ error: "Sesión inválida o vencida. Volvé a iniciar sesión." });
  }
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
        supabaseFetch(`bienestar_diario_real?usuario_id=eq.${usuarioId}&select=fecha_hora,energia`),
      ]);

      // fecha (YYYY-MM-DD) -> energía promedio ese día (mismo cálculo que patrones-observacionales.js).
      const energiaPorFecha = {};
      const conteoPorFecha = {};
      for (const b of bienestares) {
        if (b.energia === null || b.energia === undefined) continue;
        const fecha = String(b.fecha_hora).slice(0, 10);
        energiaPorFecha[fecha] = (energiaPorFecha[fecha] || 0) + b.energia;
        conteoPorFecha[fecha] = (conteoPorFecha[fecha] || 0) + 1;
      }
      for (const fecha of Object.keys(energiaPorFecha)) {
        energiaPorFecha[fecha] = energiaPorFecha[fecha] / conteoPorFecha[fecha];
      }

      const fechasConAlternativa = new Set(comidas.map((c) => c.fecha));
      const grupoConAlternativa = [...fechasConAlternativa]
        .filter((f) => energiaPorFecha[f] !== undefined)
        .map((f) => energiaPorFecha[f]);
      const grupoBase = Object.entries(energiaPorFecha)
        .filter(([fecha]) => !fechasConAlternativa.has(fecha))
        .map(([, valor]) => valor);

      let patron = null;
      if (grupoConAlternativa.length >= OCURRENCIAS_MINIMAS && grupoBase.length >= 1) {
        const promedioCon = grupoConAlternativa.reduce((a, b) => a + b, 0) / grupoConAlternativa.length;
        const promedioBase = grupoBase.reduce((a, b) => a + b, 0) / grupoBase.length;
        if (Math.abs(promedioCon - promedioBase) >= DIFERENCIA_MINIMA) {
          patron = {
            promedioConAlternativa: Math.round(promedioCon * 10) / 10,
            promedioGeneral: Math.round(promedioBase * 10) / 10,
            ocurrencias: grupoConAlternativa.length,
          };
        }
      }

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
      // Upsert real vía PostgREST: on_conflict sobre el UNIQUE(usuario_id, alternativa_id).
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
// END: /api/registrar-reaccion.js
