// api/generar-insights.js
// Motor de Correlación: cruza "Registro Diario Real" (comidas/bloqueos) con
// "Bienestar Diario Real" (energía/ánimo/sueño/digestión) para un usuario,
// y genera frases de insight en lenguaje simple.
//
// Reglas confirmadas:
// - Ventana de comparación: promedio de bienestar de los 2-3 días siguientes a cada bloqueo.
// - Umbral mínimo: 3+ repeticiones del mismo bloqueo Y 10+ días de registro cruzado.
// - Diferencia mínima para mostrar un insight: 0.7 puntos (escala 1-5).

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const BASE_ID = 'appVzRFXuykP2ZBvR';

const TABLES = {
  registro: 'tblHYg7bZCVvgiEOe',
  bloqueos: 'tblfYPLNnJDvStK3q',
  bienestar: 'tbldbb580xRTayNJT',
  insights: 'tblhoGZoBgy3Kq7kn',
  usuarios: 'tblJDf0WF5eCTWxLt',
};

const FIELDS = {
  registro: {
    fecha: 'fldhXNUiS6zbkyfwW',
    usuario: 'fld3S0l46TCaGbEPy',
    bloqueosDetectados: 'fldUGfLDclHefFJjD',
  },
  bloqueos: {
    nombre: 'fldcnk9h2fRlOWgbL',
  },
  bienestar: {
    fechaHora: 'fldcZa7HAYVLD2dGU',
    usuario: 'fldRUM2cHk1vHNrNw',
    energia: 'fldqHkAaafjlYUoIu',
    animo: 'fldv6YpDiCRqsDd0X',
    sueno: 'fldG5sTb34bJCMtcb',
    digestion: 'fldvdAffD3stkIf2p',
  },
  insights: {
    usuario: 'fldVIDaXtAn2qDTWR',
    fechaCalculo: 'fld8quT8E6fRlz1LB',
    estado: 'fldod7rbWRfaKV0GS',
    json: 'fldW3X0NQRS8L6jqd',
  },
  usuarios: {
    nivelAcceso: 'fld9xEnJaUsYg1U9q',
  },
};

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

async function airtableFetch(path, options = {}) {
  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable error ${res.status}: ${body}`);
  }
  return res.json();
}

// Trae TODOS los registros de una tabla filtrados por el link a Usuario (paginado)
async function fetchAllByUsuario(tableId, usuarioFieldId, usuarioId, fieldIds) {
  let records = [];
  let offset;
  const fieldsParam = fieldIds.map((f) => `fields[]=${f}`).join('&');
  const formula = encodeURIComponent(`FIND("${usuarioId}", ARRAYJOIN({${usuarioFieldId}}))`);

  do {
    const url = `${tableId}?filterByFormula=${formula}&${fieldsParam}&returnFieldsByFieldId=true${
      offset ? `&offset=${offset}` : ''
    }`;
    const data = await airtableFetch(url);
    records = records.concat(data.records);
    offset = data.offset;
  } while (offset);

  return records;
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
    if (!AIRTABLE_API_KEY) {
      return res.status(500).json({ error: 'Falta configurar AIRTABLE_API_KEY en Vercel' });
    }

    // 0) Chequear nivel de acceso ANTES de calcular nada (el análisis es lo que se paga)
    const usuarioRec = await airtableFetch(
      `${TABLES.usuarios}/${usuarioId}?returnFieldsByFieldId=true`
    );
    const nivel = usuarioRec.fields[FIELDS.usuarios.nivelAcceso];
    const esPremium = nivel === 'Premium' || nivel === 'Personalizado';

    if (!esPremium) {
      return res.status(200).json({
        estado: 'bloqueado',
        muestra: MUESTRA_GENERICA,
      });
    }

    // 1) Traer comidas del usuario (con bloqueos vinculados)
    const registros = await fetchAllByUsuario(
      TABLES.registro,
      FIELDS.registro.usuario,
      usuarioId,
      [FIELDS.registro.fecha, FIELDS.registro.usuario, FIELDS.registro.bloqueosDetectados]
    );

    // 2) Traer bienestar del usuario, armar mapa fecha -> métricas promedio del día
    const bienestarRecs = await fetchAllByUsuario(
      TABLES.bienestar,
      FIELDS.bienestar.usuario,
      usuarioId,
      [
        FIELDS.bienestar.fechaHora,
        FIELDS.bienestar.usuario,
        FIELDS.bienestar.energia,
        FIELDS.bienestar.animo,
        FIELDS.bienestar.sueno,
        FIELDS.bienestar.digestion,
      ]
    );

    const bienestarPorFecha = {}; // { '2026-07-05': { energia: [3,4], animo: [2], ... } }
    for (const rec of bienestarRecs) {
      const f = rec.fields;
      const fecha = fechaISO(f[FIELDS.bienestar.fechaHora]);
      if (!bienestarPorFecha[fecha]) {
        bienestarPorFecha[fecha] = { energia: [], animo: [], sueno: [], digestion: [] };
      }
      const push = (metrica, fieldId) => {
        const val = f[fieldId];
        if (val !== undefined && val !== null) {
          bienestarPorFecha[fecha][metrica].push(Number(val));
        }
      };
      push('energia', FIELDS.bienestar.energia);
      push('animo', FIELDS.bienestar.animo);
      push('sueno', FIELDS.bienestar.sueno);
      push('digestion', FIELDS.bienestar.digestion);
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
      const fecha = fechaISO(reg.fields[FIELDS.registro.fecha]);
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

    // 4) Traer nombres de los bloqueos detectados en cada registro (batch, máx 10 ids por request de Airtable)
    const idsBloqueos = [
      ...new Set(registros.flatMap((r) => r.fields[FIELDS.registro.bloqueosDetectados] || [])),
    ];
    const nombresBloqueoPorId = {};
    for (let i = 0; i < idsBloqueos.length; i += 10) {
      const lote = idsBloqueos.slice(i, i + 10);
      const formula = encodeURIComponent(
        `OR(${lote.map((id) => `RECORD_ID()="${id}"`).join(',')})`
      );
      const data = await airtableFetch(
        `${TABLES.bloqueos}?filterByFormula=${formula}&fields[]=${FIELDS.bloqueos.nombre}&returnFieldsByFieldId=true`
      );
      for (const rec of data.records) {
        nombresBloqueoPorId[rec.id] = rec.fields[FIELDS.bloqueos.nombre];
      }
    }

    // 5) Agrupar ocurrencias por nombre de bloqueo, con la fecha de cada una
    const ocurrenciasPorBloqueo = {}; // { 'Milanesa + Papas Fritas': ['2026-07-01', ...] }
    for (const reg of registros) {
      const fecha = fechaISO(reg.fields[FIELDS.registro.fecha]);
      const idsDetectados = reg.fields[FIELDS.registro.bloqueosDetectados] || [];
      for (const id of idsDetectados) {
        const nombre = nombresBloqueoPorId[id];
        if (!nombre) continue;
        if (!ocurrenciasPorBloqueo[nombre]) ocurrenciasPorBloqueo[nombre] = [];
        ocurrenciasPorBloqueo[nombre].push(fecha);
      }
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
  // Guarda el resultado en "Insights Generados" (1 registro nuevo por cálculo)
  await airtableFetch(`${TABLES.insights}`, {
    method: 'POST',
    body: JSON.stringify({
      records: [
        {
          fields: {
            [FIELDS.insights.usuario]: [usuarioId],
            [FIELDS.insights.fechaCalculo]: new Date().toISOString(),
            [FIELDS.insights.estado]: resultado.estado,
            [FIELDS.insights.json]: JSON.stringify(resultado.insights),
          },
        },
      ],
      typecast: true,
    }),
  });

  return res.status(200).json(resultado);
}
