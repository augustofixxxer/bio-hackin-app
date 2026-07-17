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
// ============================================================
// SECCIÓN 1 — MOTOR PURO (no conoce nivel de acceso, no conoce req/res)
// ============================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error((data && (data.message || data.error)) || `Supabase error ${res.status}`);
  }
  return data;
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

// Calcula el resultado completo del insight para un usuario y lo persiste en
// "insights_generados". Devuelve el resultado como dato — no responde HTTP,
// eso es responsabilidad exclusiva de la Sección 2.
async function calcularInsights(usuarioId) {
  const registros = await supabaseFetch(
    `registro_diario_real?usuario_id=eq.${usuarioId}&select=id,fecha`
  );

  const bienestarRecs = await supabaseFetch(
    `bienestar_diario_real?usuario_id=eq.${usuarioId}&select=fecha_hora,energia,animo,sueno,digestion`
  );

  const bienestarPorFecha = {};
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
  const bienestarDiario = {};
  for (const fecha of Object.keys(bienestarPorFecha)) {
    bienestarDiario[fecha] = {};
    for (const m of METRICAS) {
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
// SECCIÓN 2 — CAPA DE ACCESO / PRESENTACIÓN (endpoint HTTP)
// Acá vive el nivel de acceso, Premium, y todo lo comercial.
// La Sección 1 nunca recibe ni conoce nada de lo que hay acá abajo.
// ============================================================

const MUESTRA_GENERICA = {
  bloqueo: 'Milanesa + Papas Fritas (ejemplo)',
  metrica: 'Energía',
  frase: 'Los días después de "Milanesa + Papas Fritas", tu energía bajó en promedio 1.2 puntos comparado a tus días habituales. Este es un ejemplo — suscribite para ver tus propios patrones reales.',
};

module.exports = async (req, res) => {
  try {
    const usuarioId = req.query?.usuarioId || req.body?.usuarioId;
    if (!usuarioId) {
      return res.status(400).json({ error: 'Falta usuarioId' });
    }
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return res.status(500).json({ error: 'Falta configurar SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Vercel' });
    }

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

    const resultado = await calcularInsights(usuarioId);
    return res.status(200).json(resultado);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error generando insights', detalle: err.message });
  }
};
