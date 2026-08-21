// api/generar-insights.js
//
// ⚠️ Arquitectura de un solo archivo por decisión operativa (Sprint 16, corrección
// post-deployment): un `require` entre carpetas (api/ -> lib/) falló dos veces en
// producción porque el flujo de deploy manual (subida desde el celular, sin build
// local) no garantiza que Vercel resuelva archivos fuera de /api de forma consistente.
// La separación de responsabilidades definida por Arquitectura se mantiene INTACTA
// como dos secciones claras dentro de este archivo — no se mezclan ni se pierde
// ninguna de las reglas del Sprint 16, solo se elimina el punto de fallo entre archivos.
//
// MIGRACIÓN 25/07/2026 (rigurosa, un solo cambio estructural): este archivo pasó de
// CommonJS (`module.exports`) a ESM (`import`/`export default`) para poder usar los
// mismos módulos compartidos que ya funcionan en producción en los otros 7 archivos
// de /api (_supabase.js, _instrumentacion.js) — mezclar CommonJS con un import de un
// archivo ESM es justamente el tipo de fricción entre sistemas de módulos que causó
// el incidente de Sprint 16, así que en vez de mezclar, se unificó todo a ESM, el
// mismo estilo ya validado en producción en registrar-comida.js y el resto. Ningún
// comportamiento de la Sección 1 (Motor Puro) cambió — se movieron solo imports.
//
// CONSOLIDACIÓN DE DEPLOY (19/08/2026): historial.js (Fase 7) se fusionó acá — Vercel
// Hobby tiene un límite de 12 funciones serverless por deployment; el proyecto llegó a
// 18 y toda publicación falló en silencio durante ~11 días. CERO cambio de lógica: el
// handler de historial es el mismo código, movido a su propia función (manejarHistorial)
// y ruteado por ?vista=historial. La Sección 1 (Motor Puro) de insights no se tocó.
//
// ============================================================
// SECCIÓN 1 — MOTOR PURO (no conoce nivel de acceso, no conoce req/res)
// ============================================================

import { supabaseFetch, SUPABASE_URL, SUPABASE_KEY } from "./_supabase.js";
import { emitirEvento, evaluarValidacionParalela } from "./_instrumentacion.js";
import { usuarioIdDesdeRequest } from "./_sesion.js";

// REDISEÑO 30/07/2026 (definido con Augusto): "animo" sale del sistema de correlación
// (variable contaminada por factores no alimenticios). Se suman "hidratacion" y
// "actividad_fisica". Los 3 campos nuevos/cambiados (sueno, hidratacion, actividad_fisica)
// ya no son escalas numéricas 1-5 sino categorías con base científica (ver comentarios de
// columna en Supabase) — puntajeCategoria() las traduce a un puntaje 1-3 para poder
// reutilizar la misma matemática de correlación que ya funciona para energía/digestión,
// sin reescribir el motor entero. UMBRAL_DIFERENCIA (0.7) quedó calibrado en su momento
// para una escala 1-5; en una escala 1-3 representa un salto proporcionalmente más grande
// — es un umbral más conservador para estos 3 campos, no un error. Si en la práctica
// resulta demasiado conservador, es un ajuste de un solo número, no una reescritura.
const METRICAS = ['energia', 'digestion', 'sueno', 'hidratacion', 'actividad_fisica'];
const NOMBRE_METRICA = {
  energia: 'Energía', digestion: 'Digestión',
  sueno: 'Sueño', hidratacion: 'Hidratación', actividad_fisica: 'Actividad física',
};
const CATEGORIAS_NUMERICAS = new Set(['sueno', 'hidratacion', 'actividad_fisica']);

// Mapea cada valor categórico a un puntaje 1-3 (a mayor puntaje, patrón más alineado con
// la evidencia). "sueno" tiene forma de U (dormir de más también es subóptimo), el resto
// es monótono creciente.
const PUNTAJE_CATEGORIA = {
  sueno: { menos_6h: 1, '6_7h': 2, '7_9h': 3, mas_9h: 2 },
  hidratacion: { menos_1l: 1, '1_2l': 2, '2_3l': 3, mas_3l: 3 },
  actividad_fisica: { sedentario: 1, activo: 2, muy_activo: 3 },
};
function puntajeCategoria(metrica, valor) {
  if (valor === undefined || valor === null) return null;
  const tabla = PUNTAJE_CATEGORIA[metrica];
  return tabla && tabla[valor] !== undefined ? tabla[valor] : null;
}

const UMBRAL_REPETICIONES = 3;
const UMBRAL_DIAS_CRUZADOS = 10;
const UMBRAL_DIFERENCIA = 0.7;
const VENTANA_DIAS = 3; // promedio de los 2-3 días siguientes

function fechaISO(dateStr) {
  return new Date(dateStr).toISOString().slice(0, 10);
}

function sumarDias(fechaISOStr, n) {
  const d = new Date(fechaISOStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function promedio(nums) {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// Calcula el resultado completo del insight para un usuario y lo persiste en
// "insights_generados". Devuelve el resultado como dato — no responde HTTP,
// eso es responsabilidad exclusiva de la Sección 2.
//
// FASE 7 (10/08/2026): acepta opciones para soportar el paywall real (antes esta función
// solo se llamaba para Premium sin restricciones — Gratis estaba 100% bloqueado con un
// ejemplo fijo, ver Sección 2). "opciones.metricas" restringe qué métricas se calculan
// (Gratis = solo energía), "opciones.fechaDesde" restringe la ventana de datos que entra
// al cálculo (Gratis = últimos 14 días). El motor puro no sabe POR QUÉ se restringe —
// solo recibe los límites ya decididos por la Sección 2 (capa de acceso).
async function calcularInsights(usuarioId, opciones = {}) {
  const metricasActivas = opciones.metricas || METRICAS;
  const fechaDesde = opciones.fechaDesde || null;

  let registros = await supabaseFetch(
    `registro_diario_real?usuario_id=eq.${usuarioId}&select=id,fecha`
  );
  let bienestarRecs = await supabaseFetch(
    `bienestar_diario_real?usuario_id=eq.${usuarioId}&select=fecha_hora,energia,digestion,sueno,hidratacion,actividad_fisica`
  );
  if (fechaDesde) {
    registros = registros.filter((r) => r.fecha && fechaISO(r.fecha) >= fechaDesde);
    bienestarRecs = bienestarRecs.filter((b) => b.fecha_hora && fechaISO(b.fecha_hora) >= fechaDesde);
  }

  const bienestarPorFecha = {};
  for (const rec of bienestarRecs) {
    const fecha = fechaISO(rec.fecha_hora);
    if (!bienestarPorFecha[fecha]) {
      bienestarPorFecha[fecha] = { energia: [], digestion: [], sueno: [], hidratacion: [], actividad_fisica: [] };
    }
    const push = (metrica) => {
      const val = CATEGORIAS_NUMERICAS.has(metrica)
        ? puntajeCategoria(metrica, rec[metrica])
        : (rec[metrica] !== undefined && rec[metrica] !== null ? Number(rec[metrica]) : null);
      if (val !== null) {
        bienestarPorFecha[fecha][metrica].push(val);
      }
    };
    push('energia');
    push('digestion');
    push('sueno');
    push('hidratacion');
    push('actividad_fisica');
  }
  const bienestarDiario = {};
  for (const fecha of Object.keys(bienestarPorFecha)) {
    bienestarDiario[fecha] = {};
    for (const m of metricasActivas) {
      bienestarDiario[fecha][m] = promedio(bienestarPorFecha[fecha][m]);
    }
  }
  const fechasBienestar = Object.keys(bienestarDiario);

  const fechasComidaConCruce = new Set();
  for (const reg of registros) {
    if (!reg.fecha) continue;
    const fecha = fechaISO(reg.fecha);
    for (let n = 1; n <= VENTANA_DIAS; n++) {
      if (bienestarDiario[sumarDias(fecha, n)]) {
        fechasComidaConCruce.add(fecha);
        break;
      }
    }
  }

  if (fechasComidaConCruce.size < UMBRAL_DIAS_CRUZADOS) {
    return await guardarResultado(usuarioId, {
      estado: 'insuficiente',
      diasRegistrados: fechasComidaConCruce.size,
      diasFaltantes: UMBRAL_DIAS_CRUZADOS - fechasComidaConCruce.size,
      insights: [],
    });
  }

  const idsRegistro = registros.map((r) => r.id).filter(Boolean);
  let bloqueosRecs = [];
  if (idsRegistro.length > 0) {
    bloqueosRecs = await supabaseFetch(
      `bloqueos?registro_diario_id=in.(${idsRegistro.join(',')})&select=nombre_bloqueo,fecha_deteccion`
    );
  }

  const ocurrenciasPorBloqueo = {};
  for (const b of bloqueosRecs) {
    if (!b.nombre_bloqueo || !b.fecha_deteccion) continue;
    const fecha = fechaISO(b.fecha_deteccion);
    if (!ocurrenciasPorBloqueo[b.nombre_bloqueo]) ocurrenciasPorBloqueo[b.nombre_bloqueo] = [];
    ocurrenciasPorBloqueo[b.nombre_bloqueo].push(fecha);
  }

  const insights = [];
  for (const [nombreBloqueo, fechas] of Object.entries(ocurrenciasPorBloqueo)) {
    if (fechas.length < UMBRAL_REPETICIONES) continue;

    const fechasConBloqueo = new Set();
    for (const fecha of fechas) {
      for (let n = 1; n <= VENTANA_DIAS; n++) {
        const f = sumarDias(fecha, n);
        if (bienestarDiario[f]) fechasConBloqueo.add(f);
      }
    }
    const fechasSinBloqueo = fechasBienestar.filter((f) => !fechasConBloqueo.has(f));

    if (fechasConBloqueo.size === 0 || fechasSinBloqueo.length === 0) continue;

    for (const metrica of metricasActivas) {
      const promCon = promedio(
        [...fechasConBloqueo].map((f) => bienestarDiario[f][metrica]).filter((v) => v !== null)
      );
      const promSin = promedio(
        fechasSinBloqueo.map((f) => bienestarDiario[f][metrica]).filter((v) => v !== null)
      );
      if (promCon === null || promSin === null) continue;

      const diferencia = promSin - promCon;
      if (Math.abs(diferencia) >= UMBRAL_DIFERENCIA) {
        const direccion = diferencia > 0 ? 'bajó' : 'subió';
        insights.push({
          bloqueo: nombreBloqueo,
          metrica: NOMBRE_METRICA[metrica],
          diferencia: Math.round(Math.abs(diferencia) * 10) / 10,
          frase: `Los días después de "${nombreBloqueo}", tu ${NOMBRE_METRICA[
            metrica
          ].toLowerCase()} ${direccion} en promedio ${Math.round(
            Math.abs(diferencia) * 10
          ) / 10} puntos comparado a tus días habituales.`,
        });
      }
    }
  }

  const estado = insights.length > 0 ? 'ok' : 'sin_patron_aun';
  return await guardarResultado(usuarioId, { estado, insights });
}

async function guardarResultado(usuarioId, resultado) {
  await supabaseFetch(`insights_generados`, {
    method: 'POST',
    body: JSON.stringify({
      usuario_id: usuarioId,
      fecha_calculo: new Date().toISOString(),
      estado: resultado.estado,
      insights_json: resultado.insights,
    }),
  });

  return resultado;
}

// ============================================================
// SECCIÓN 1B — HISTORIAL (ex historial.js, Fase 7, fusionado 19/08/2026)
// Día por día, racha, resumen semanal y exportación CSV. Reutiliza fechaISO/sumarDias
// de la Sección 1 (idénticas en ambos archivos originales, sin duplicar).
// ============================================================

const LIMITE_DIAS_GRATIS_HISTORIAL = 14;

function calcularRacha(fechasConActividad) {
  const set = new Set(fechasConActividad);
  let racha = 0;
  let cursor = fechaISO(new Date().toISOString());
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

async function verificarAccesoHistorial(usuarioId) {
  const rows = await supabaseFetch(`usuarios?id=eq.${usuarioId}&select=cuenta_suspendida,terminos_aceptados,nivel_acceso`);
  if (!rows.length) return { ok: false, status: 404, error: "Usuario no encontrado." };
  const u = rows[0];
  if (u.cuenta_suspendida === true) return { ok: false, status: 403, error: "Esta cuenta fue suspendida. Contactanos si creés que es un error." };
  if (u.terminos_aceptados !== true) return { ok: false, status: 403, error: "Debés aceptar los Términos y Condiciones para continuar.", requiereTerminos: true };
  return { ok: true, esPremium: u.nivel_acceso === "Premium" };
}

// Ruta: GET /api/generar-insights?vista=historial (antes: GET /api/historial)
async function manejarHistorial(req, res, usuarioId) {
  let acceso;
  try {
    acceso = await verificarAccesoHistorial(usuarioId);
    if (!acceso.ok) return res.status(acceso.status).json({ error: acceso.error, requiereTerminos: acceso.requiereTerminos });
  } catch (err) {
    return res.status(400).json({ error: "El usuarioId recibido no es válido.", detail: String(err) });
  }

  const formatoCSV = req.query?.formato === "csv";
  if (formatoCSV && !acceso.esPremium) {
    return res.status(403).json({ error: "Exportar es una función Premium." });
  }

  const fechaDesde = acceso.esPremium ? null : sumarDias(fechaISO(new Date().toISOString()), -LIMITE_DIAS_GRATIS_HISTORIAL);

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
      const hoy = fechaISO(new Date().toISOString());
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

// ============================================================
// SECCIÓN 2 — CAPA DE ACCESO / PRESENTACIÓN (endpoint HTTP)
// Acá vive el nivel de acceso, Premium, y todo lo comercial.
// La Sección 1 nunca recibe ni conoce nada de lo que hay acá abajo.
// ============================================================

// AUTENTICACIÓN REAL DE SESIÓN (29/07/2026): el usuarioId ya NO se toma de
// query/body — se extrae del "pase" firmado (ver _sesion.js), que ya viene
// validado como perteneciente a un usuario real. La validación UUID de acá
// queda de todos modos como cinturón de seguridad extra antes de interpolar
// en URLs de PostgREST (usuarios, registro_diario_real, bienestar_diario_real).
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function esUUIDValido(valor) {
  return typeof valor === "string" && UUID_REGEX.test(valor);
}

// FASE 7 (10/08/2026): MUESTRA_GENERICA se eliminó — Gratis ya no ve un ejemplo fijo,
// ve sus propios datos reales limitados (ver handler).

export default async function handler(req, res) {
  try {
    const usuarioId = usuarioIdDesdeRequest(req);
    if (!usuarioId) {
      return res.status(401).json({ error: 'Sesión inválida o vencida. Volvé a iniciar sesión.' });
    }
    if (!esUUIDValido(usuarioId)) {
      return res.status(400).json({ error: 'usuarioId inválido.' });
    }
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return res.status(500).json({ error: 'Falta configurar SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Vercel' });
    }

    // Consolidación de deploy (19/08/2026): historial vive acá mismo ahora, bajo
    // ?vista=historial — mismo usuarioId ya extraído/validado arriba, sin duplicar esa
    // lógica. No interfiere con el flujo de insights de abajo (return corta acá).
    if (req.query?.vista === "historial") {
      return manejarHistorial(req, res, usuarioId);
    }

    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Método no permitido, usar GET.' });
    }

    const usuarioRows = await supabaseFetch(
      `usuarios?id=eq.${usuarioId}&select=cuenta_suspendida,terminos_aceptados,nivel_acceso`
    );
    if (!usuarioRows.length) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    const usuario = usuarioRows[0];

    const accesoBasico = usuario.cuenta_suspendida !== true && usuario.terminos_aceptados === true;

    // MIS Etapa 3 — Validación Paralela. No cambia el resultado real: solo deja
    // evidencia de si el modelo nuevo hubiera coincidido con esta decisión legacy.
    await evaluarValidacionParalela({
      usuarioId,
      capabilityName: "uso_basico_app",
      decisionLegacy: accesoBasico,
      sourceComponent: "generar-insights",
    });

    if (usuario.cuenta_suspendida === true) {
      return res.status(403).json({ error: 'Esta cuenta fue suspendida. Contactanos si creés que es un error.' });
    }
    if (usuario.terminos_aceptados !== true) {
      return res.status(403).json({ error: 'Debés aceptar los Términos y Condiciones para continuar.', requiereTerminos: true });
    }

    const esPremium = usuario.nivel_acceso === 'Premium';

    // FASE 7 (10/08/2026) — CAMBIO DE COMPORTAMIENTO declarado: antes, Gratis estaba
    // 100% bloqueado (0 datos reales, solo MUESTRA_GENERICA). Paywall aprobado por
    // Marketing + Fundador define "Gratis = 14 días + patrones básicos solo energía".
    // Este componente estaba "Validado en producción" con el comportamiento viejo —
    // este bloque reemplaza ese comportamiento, no lo extiende por fuera.
    const LIMITE_DIAS_GRATIS = 14;
    const opciones = esPremium
      ? {}
      : { metricas: ['energia'], fechaDesde: sumarDias(fechaISO(new Date().toISOString()), -LIMITE_DIAS_GRATIS) };

    const resultado = await calcularInsights(usuarioId, opciones);
    resultado.limitado14dias = !esPremium;

    await emitirEvento({
      usuarioId,
      eventType: esPremium ? "insights_generados" : "insights_generados_gratis_limitado",
      sourceComponent: "generar-insights",
      requestingComponent: "generar-insights",
      payload: { estado: resultado.estado, cantidadInsights: resultado.insights?.length || 0, esPremium },
    });

    return res.status(200).json(resultado);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error generando insights', detalle: err.message });
  }
}
// END: /api/generar-insights.js
