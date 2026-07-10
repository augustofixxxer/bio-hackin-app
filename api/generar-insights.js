// api/generar-insights.js
// Motor de Correlación: cruza "registro_diario_real" (comidas/bloqueos) con
// "bienestar_diario_real" (energía/ánimo/sueño/digestión) para un usuario,
// y genera frases de insight en lenguaje simple.
//
// Reglas confirmadas:
// - Ventana de comparación: promedio de bienestar de los 2-3 días siguientes a cada bloqueo.
// - Umbral mínimo: 3+ repeticiones del mismo bloqueo Y 10+ días de registro cruzado.
// - Diferencia mínima para mostrar un insight: 0.7 puntos (escala 1-5).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const MUESTRA_GENERICA = {
  bloqueo: 'Milanesa + Papas Fritas (ejemplo)',
  metrica: 'Energía',
  frase: 'Los días después de "Milanesa + Papas Fritas", tu energía bajó en promedio 1.2 puntos comparado a tus días habituales. Este es un ejemplo — suscribite para ver tus propios patrones reales.',
};

const METRICAS = ['energia', 'animo', 'sueno', 'digestion'];
const NOMBRE_METRICA = { energia: 'Energía', animo: 'Ánimo', sueno: 'Sueño', digestion: 'Digestión' };

const UMBRAL_REPETICIONES = 3;
const UMBRAL_DIAS_CRUZADOS = 10;
const UMBRAL_DIFERENCIA = 0.7;
const VENTANA_DIAS = 3; // promedio de los 2-3 días siguientes

async function supabaseFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase error ${res.status}: ${body}`);
  }
  return res.json();
}

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

module.exports = async (req, res) => {
  try {
    const usuarioId = req.query?.usuarioId || req.body?.usuarioId;
    if (!usuarioId) {
      return res.status(400).json({ error: 'Falta usuarioId' });
    }
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return res.status(500).json({ error: 'Falta configurar SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Vercel' });
    }

    // 0) Chequear nivel de acceso ANTES de calcular nada (el análisis es lo que se paga)
    const usuarioRows = await supabaseFetch(
      `usuarios?id=eq.${usuarioId}&select=cuenta_suspendida,terminos_aceptados,nivel_acceso`
    );
    if (!usuarioRows.length) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    const usuario = usuarioRows[0];

    if (usuario.cuenta_suspendida === true) {
      return res.status(403).json({ error: 'Esta cuenta fue suspendida. Contactanos si creés que es un error.' });
    }
    if (usuario.terminos_aceptados !== true) {
      return res.status(403).json({ error: 'Debés aceptar los Términos y Condiciones para continuar.', requiereTerminos: true });
    }

    const esPremium = usuario.nivel_acceso === 'Premium' || usuario.nivel_acceso === 'Personalizado';

    if (!esPremium) {
      return res.status(200).json({
        estado: 'bloqueado',
        muestra: MUESTRA_GENERICA,
      });
    }

    // 1) Traer comidas del usuario (id + fecha: el id lo usamos después para traer sus bloqueos)
    const registros = await supabaseFetch(
      `registro_diario_real?usuario_id=eq.${usuarioId}&select=id,fecha`
    );

    // 2) Traer bienestar del usuario, armar mapa fecha -> métricas promedio del día
    const bienestarRecs = await supabaseFetch(
      `bienestar_diario_real?usuario_id=eq.${usuarioId}&select=fecha_hora,energia,animo,sueno,digestion`
    );

    const bienestarPorFecha = {}; // { '2026-07-05': { energia: [3,4], animo: [2], ... } }
    for (const rec of bienestarRecs) {
      const fecha = fechaISO(rec.fecha_hora);
      if (!bienestarPorFecha[fecha]) {
        bienestarPorFecha[fecha] = { energia: [], animo: [], sueno: [], digestion: [] };
      }
      const push = (metrica) => {
        const val = rec[metrica];
        if (val !== undefined && val !== null) {
          bienestarPorFecha[fecha][metrica].push(Number(val));
        }
      };
      push('energia');
      push('animo');
      push('sueno');
      push('digestion');
    }
    // Promediar si hubo más de un registro el mismo día
    const bienestarDiario = {}; // { fecha: { energia: 3.5, animo: 2, ... } }
    for (const fecha of Object.keys(bienestarPorFecha)) {
      bienestarDiario[fecha] = {};
      for (const m of METRICAS) {
        bienestarDiario[fecha][m] = promedio(bienestarPorFecha[fecha][m]);
      }
    }
    const fechasBienestar = Object.keys(bienestarDiario);

    // 3) Chequeo de umbral: días con registro cruzado (comida con bienestar en ventana de 3 días después)
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
      return await guardarYResponder(usuarioId, {
        estado: 'insuficiente',
        diasRegistrados: fechasComidaConCruce.size,
        diasFaltantes: UMBRAL_DIAS_CRUZADOS - fechasComidaConCruce.size,
        insights: [],
      }, res);
    }

    // 4) Traer los bloqueos ligados a esas comidas, ya con su nombre incluido (no hace falta
    // cruzar IDs por separado: en Supabase cada bloqueo ya guarda su propio nombre).
    const idsRegistro = registros.map((r) => r.id).filter(Boolean);
    let bloqueosRecs = [];
    if (idsRegistro.length > 0) {
      bloqueosRecs = await supabaseFetch(
        `bloqueos?registro_diario_id=in.(${idsRegistro.join(',')})&select=nombre_bloqueo,fecha_deteccion`
      );
    }

    // 5) Agrupar ocurrencias por nombre de bloqueo, con la fecha de cada una
    const ocurrenciasPorBloqueo = {}; // { 'Milanesa + Papas Fritas': ['2026-07-01', ...] }
    for (const b of bloqueosRecs) {
      if (!b.nombre_bloqueo || !b.fecha_deteccion) continue;
      const fecha = fechaISO(b.fecha_deteccion);
      if (!ocurrenciasPorBloqueo[b.nombre_bloqueo]) ocurrenciasPorBloqueo[b.nombre_bloqueo] = [];
      ocurrenciasPorBloqueo[b.nombre_bloqueo].push(fecha);
    }

    // 6) Para cada bloqueo con 3+ repeticiones: comparar grupo CON vs grupo SIN
    const insights = [];
    for (const [nombreBloqueo, fechas] of Object.entries(ocurrenciasPorBloqueo)) {
      if (fechas.length < UMBRAL_REPETICIONES) continue;

      // Fechas de bienestar que caen en la ventana de 1-3 días después de una ocurrencia
      const fechasConBloqueo = new Set();
      for (const fecha of fechas) {
        for (let n = 1; n <= VENTANA_DIAS; n++) {
          const f = sumarDias(fecha, n);
          if (bienestarDiario[f]) fechasConBloqueo.add(f);
        }
      }
      // Fechas de bienestar que NO están en ninguna ventana "con bloqueo" (línea base personal)
      const fechasSinBloqueo = fechasBienestar.filter((f) => !fechasConBloqueo.has(f));

      if (fechasConBloqueo.size === 0 || fechasSinBloqueo.length === 0) continue;

      for (const metrica of METRICAS) {
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
    return await guardarYResponder(usuarioId, { estado, insights }, res);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error generando insights', detalle: err.message });
  }
};

async function guardarYResponder(usuarioId, resultado, res) {
  // Guarda el resultado en "insights_generados" (1 registro nuevo por cálculo)
  await supabaseFetch(`insights_generados`, {
    method: 'POST',
    body: JSON.stringify({
      usuario_id: usuarioId,
      fecha_calculo: new Date().toISOString(),
      estado: resultado.estado,
      insights_json: resultado.insights,
    }),
  });

  return res.status(200).json(resultado);
}
