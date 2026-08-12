// api/historial.js
// Fase 7 (10/08/2026) — Historial día por día, racha, resumen semanal y exportación CSV.
//
// No existía ningún endpoint que devolviera el detalle día por día (solo
// generar-insights.js, que devuelve patrones ya calculados, nunca los datos crudos).
// Necesario para 3 cosas del paywall aprobado:
//  - Gratis ve 14 días de historial / Premium ilimitado.
//  - Exportar CSV (Premium únicamente).
//  - Resumen semanal (Premium únicamente) — comparación de CONSTANCIA (días
//    registrados esta semana vs la anterior), nunca una afirmación de diagnóstico,
//    tal como pidió Marketing en el copy de la pantalla Premium.
//
// Mismo patrón que el resto: single-file, auth vía _sesion.js, acceso vía _supabase.js.

import { usuarioIdDesdeRequest } from "./_sesion.js";
import { supabaseFetch, SUPABASE_URL, SUPABASE_KEY } from "./_supabase.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIMITE_DIAS_GRATIS = 14;

function fechaISO(dateStr) {
  return new Date(dateStr).toISOString().slice(0, 10);
}
function sumarDias(fechaISOStr, n) {
  const d = new Date(fechaISOStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function hoyISO() {
  return fechaISO(new Date().toISOString());
}

async function verificarAcceso(usuarioId) {
  const rows = await supabaseFetch(`usuarios?id=eq.${usuarioId}&select=cuenta_suspendida,terminos_aceptados,nivel_acceso`);
  if (!rows.length) return { ok: false, status: 404, error: "Usuario no encontrado." };
  const u = rows[0];
  if (u.cuenta_suspendida === true) return { ok: false, status: 403, error: "Esta cuenta fue suspendida. Contactanos si creés que es un error." };
  if (u.terminos_aceptados !== true) return { ok: false, status: 403, error: "Debés aceptar los Términos y Condiciones para continuar.", requiereTerminos: true };
  return { ok: true, esPremium: u.nivel_acceso === "Premium" };
}

// Calcula la racha actual: días consecutivos (desde hoy hacia atrás) con al menos
// una comida o un registro de bienestar. Se corta apenas aparece un día sin nada.
function calcularRacha(fechasConActividad) {
  const set = new Set(fechasConActividad);
  let racha = 0;
  let cursor = hoyISO();
  while (set.has(cursor)) {
    racha += 1;
    cursor = sumarDias(cursor, -1);
  }
  return racha;
}

function aCSV(historial) {
  const filas = [["fecha", "comidas_registradas", "energia", "digestion", "sueno", "hidratacion", "actividad_fisica"]];
  for (const dia of historial) {
    filas.push([
      dia.fecha,
      dia.comidas.map((c) => c.texto).join(" | "),
      dia.bienestar?.energia ?? "",
      dia.bienestar?.digestion ?? "",
      dia.bienestar?.sueno ?? "",
      dia.bienestar?.hidratacion ?? "",
      dia.bienestar?.actividad_fisica ?? "",
    ]);
  }
  return filas.map((f) => f.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
}

export default async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: "Falta configurar SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY." });
  }
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método no permitido, usar GET." });
  }

  const usuarioId = usuarioIdDesdeRequest(req);
  if (!usuarioId) return res.status(401).json({ error: "Sesión inválida o vencida. Volvé a iniciar sesión." });
  if (!UUID_REGEX.test(usuarioId)) return res.status(400).json({ error: "usuarioId inválido." });

  let acceso;
  try {
    acceso = await verificarAcceso(usuarioId);
    if (!acceso.ok) return res.status(acceso.status).json({ error: acceso.error, requiereTerminos: acceso.requiereTerminos });
  } catch (err) {
    return res.status(400).json({ error: "El usuarioId recibido no es válido.", detail: String(err) });
  }

  const formatoCSV = req.query?.formato === "csv";
  if (formatoCSV && !acceso.esPremium) {
    return res.status(403).json({ error: "Exportar es una función Premium." });
  }

  const fechaDesde = acceso.esPremium ? null : sumarDias(hoyISO(), -LIMITE_DIAS_GRATIS);

  try {
    let [comidas, bienestares] = await Promise.all([
      supabaseFetch(`registro_diario_real?usuario_id=eq.${usuarioId}&select=fecha,comida_registrada,alternativa_id&order=fecha.desc`),
      supabaseFetch(`bienestar_diario_real?usuario_id=eq.${usuarioId}&select=fecha_hora,energia,digestion,sueno,hidratacion,actividad_fisica`),
    ]);
    if (fechaDesde) {
      comidas = comidas.filter((c) => c.fecha && fechaISO(c.fecha) >= fechaDesde);
      bienestares = bienestares.filter((b) => b.fecha_hora && fechaISO(b.fecha_hora) >= fechaDesde);
    }

    const porFecha = {};
    const asegurar = (f) => { if (!porFecha[f]) porFecha[f] = { fecha: f, comidas: [], bienestar: null }; return porFecha[f]; };
    for (const c of comidas) {
      if (!c.fecha) continue;
      asegurar(fechaISO(c.fecha)).comidas.push({ texto: c.comida_registrada, alternativaId: c.alternativa_id || null });
    }
    for (const b of bienestares) {
      if (!b.fecha_hora) continue;
      const dia = asegurar(fechaISO(b.fecha_hora));
      // Si hay más de un registro de bienestar el mismo día, se queda con el más reciente
      // (mismo criterio simple que ya usa el resto de la app, no promedia acá).
      dia.bienestar = { energia: b.energia, digestion: b.digestion, sueno: b.sueno, hidratacion: b.hidratacion, actividad_fisica: b.actividad_fisica };
    }

    const historial = Object.values(porFecha).sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
    const racha = calcularRacha(Object.keys(porFecha));

    if (formatoCSV) {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=historial-reseteo-propio.csv");
      return res.status(200).send(aCSV(historial));
    }

    let resumenSemanal = null;
    if (acceso.esPremium) {
      const hoy = hoyISO();
      const hace7 = sumarDias(hoy, -7);
      const hace14 = sumarDias(hoy, -14);
      const diasEstaSemana = Object.keys(porFecha).filter((f) => f >= hace7 && f <= hoy).length;
      const diasSemanaAnterior = Object.keys(porFecha).filter((f) => f >= hace14 && f < hace7).length;
      resumenSemanal = { diasRegistradosEstaSemana: diasEstaSemana, diasRegistradosSemanaAnterior: diasSemanaAnterior };
    }

    return res.status(200).json({
      historial,
      racha,
      limitado14dias: !acceso.esPremium,
      resumenSemanal,
    });
  } catch (err) {
    return res.status(500).json({ error: "Error leyendo el historial", detail: String(err) });
  }
}
// END: /api/historial.js
