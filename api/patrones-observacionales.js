// api/patrones-observacionales.js
// GET — devuelve el "teaser" del paywall con valor demostrado en Mis Patrones (Estado A/B).
//
// Motor SEPARADO y liviano de generar-insights.js a propósito: CERO llamadas a LLM, CERO
// costo de IA — solo cuenta y compara registros ya existentes en Supabase. Se llama
// únicamente desde el frontend cuando generar-insights.js devuelve "bloqueado" (usuario no
// Premium); nunca se ejecuta para usuarios Premium, así que no les agrega costo.
//
// Especificación de Marketing/Psicología del Consumidor (04/08/2026): reemplaza el paywall
// candado anterior por un paywall con valor demostrado. Ver index.html, PatronesScreen,
// branch resultado.estado === "bloqueado".
//
// LÓGICA DEL PATRÓN (Estado B): busca comidas registradas en la Cena que contengan alguna
// palabra clave de harinas/carbohidratos simples, y compara el promedio de energía
// registrada al día siguiente contra el promedio de energía de los demás días. Solo se
// muestra como patrón real si hay al menos 2 ocurrencias Y la diferencia promedio es de al
// menos 1 punto (escala 1-5) — si no hay señal suficiente, se responde con patron:null en
// vez de fabricar un patrón que no está (Constitución del proyecto: nunca fabricar
// evidencia). PALABRAS_HARINAS es una lista acotada a propósito — ampliarla es una decisión
// de contenido de Augusto/Marketing, no algo para que Desarrollo infle por su cuenta.
//
// Mismo patrón same-folder que el resto (Sprint 16: nunca separar en /lib).

import { usuarioIdDesdeRequest } from "./_sesion.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

// Blindaje legal: mismo chequeo que el resto de los endpoints protegidos.
async function verificarAcceso(usuarioId) {
  const rows = await supabaseFetch(
    `usuarios?id=eq.${usuarioId}&select=cuenta_suspendida,terminos_aceptados`
  );
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

const PALABRAS_HARINAS = ["harina", "pan", "pizza", "fideos", "pasta", "tallarines", "ñoquis"];

function contieneHarina(texto) {
  const t = (texto || "").toLowerCase();
  return PALABRAS_HARINAS.some((p) => t.includes(p));
}

// registro_diario_real.fecha es DATE (sin hora) — sumamos un día calendario en UTC para
// evitar corrimientos por zona horaria.
function sumarUnDia(fechaStr) {
  const d = new Date(fechaStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// "Hoy" en huso horario Argentina (05/08/2026, extensión para TableroAccesos — Marketing
// pidió explícitamente reusar este endpoint en vez de crear uno nuevo). Server de Vercel
// corre en UTC; sin este ajuste, alguien cargando datos después de las 21hs en Tucumán ya
// vería "mañana" del lado del servidor. Sin costo extra: son los mismos datos que ya se
// traen abajo, solo se filtran también por fecha de hoy.
const CAMPOS_BIENESTAR = ["energia", "digestion", "sueno", "hidratacion", "actividad_fisica"];

function fechaHoyArgentina() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
}

function calcularHoy(comidas, bienestares) {
  const hoyStr = fechaHoyArgentina();
  const comidasHoy = comidas.filter((c) => c.fecha === hoyStr).length;
  const filasHoy = bienestares.filter((b) => String(b.fecha_hora).slice(0, 10) === hoyStr);
  let bienestarCampos = 0;
  for (const campo of CAMPOS_BIENESTAR) {
    if (filasHoy.some((b) => b[campo] !== null && b[campo] !== undefined)) bienestarCampos++;
  }
  return { comidaRegistrada: comidasHoy > 0, comidasHoy, bienestarCampos };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método no permitido, usar GET." });
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: "Falta configurar SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY." });
  }

  const usuarioId = usuarioIdDesdeRequest(req);
  if (!usuarioId) {
    return res.status(401).json({ error: "Sesión inválida o vencida. Volvé a iniciar sesión." });
  }

  try {
    const acceso = await verificarAcceso(usuarioId);
    if (!acceso.ok) {
      return res.status(acceso.status).json({ error: acceso.error, requiereTerminos: acceso.requiereTerminos });
    }
  } catch (err) {
    return res.status(400).json({ error: "El usuarioId recibido no es válido.", detail: String(err) });
  }

  try {
    const [comidas, bienestares] = await Promise.all([
      supabaseFetch(`registro_diario_real?usuario_id=eq.${usuarioId}&select=fecha,comida_registrada,momento_dia`),
      supabaseFetch(`bienestar_diario_real?usuario_id=eq.${usuarioId}&select=fecha_hora,energia,digestion,sueno,hidratacion,actividad_fisica`),
    ]);

    const totalRegistros = comidas.length + bienestares.length;
    const hoy = calcularHoy(comidas, bienestares);

    if (totalRegistros < 3) {
      return res.status(200).json({ estado: "A", totalRegistros, patron: null, hoy });
    }

    // fecha (YYYY-MM-DD) -> energía promedio registrada ese día.
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

    const grupoConHarina = [];
    const fechasConHarina = new Set();
    for (const c of comidas) {
      if (c.momento_dia !== "Cena" || !contieneHarina(c.comida_registrada)) continue;
      const fechaSiguiente = sumarUnDia(c.fecha);
      if (energiaPorFecha[fechaSiguiente] !== undefined && !fechasConHarina.has(fechaSiguiente)) {
        grupoConHarina.push(energiaPorFecha[fechaSiguiente]);
        fechasConHarina.add(fechaSiguiente);
      }
    }

    const grupoBase = Object.entries(energiaPorFecha)
      .filter(([fecha]) => !fechasConHarina.has(fecha))
      .map(([, valor]) => valor);

    let patron = null;
    if (grupoConHarina.length >= 2 && grupoBase.length >= 1) {
      const promedioConHarina = grupoConHarina.reduce((a, b) => a + b, 0) / grupoConHarina.length;
      const promedioBase = grupoBase.reduce((a, b) => a + b, 0) / grupoBase.length;
      if (promedioBase - promedioConHarina >= 1) {
        patron = { ingrediente: "harinas", ocurrencias: grupoConHarina.length };
      }
    }

    return res.status(200).json({ estado: "B", totalRegistros, patron, hoy });
  } catch (err) {
    console.error("Error en patrones-observacionales:", err);
    return res.status(500).json({ error: "Error calculando el laboratorio", detail: String(err) });
  }
}
// END: /api/patrones-observacionales.js
