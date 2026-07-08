// Función serverless (Vercel). Recibe POST con { texto, momento }.
// Detecta coincidencias con las Reglas por palabras clave, crea el Registro Diario
// y los Bloqueos correspondientes en Airtable.

const BASE_ID = "appVzRFXuykP2ZBvR";
const TABLE_REGLAS = "tblQHXCCsWei8zXAl";
const TABLE_SOLUCIONES = "tbl8iPAmQpW0KxB8X";
const TABLE_BLOQUEOS = "tblfYPLNnJDvStK3q";
const TABLE_REGISTRO = "tblHYg7bZCVvgiEOe";
const TABLE_ALTERNATIVAS = "tblfzFS6VHCfMdmAJ";

const F_ALTERNATIVAS = {
  nombre: "fld0iRCHDJKPyAkr7",
  mecanismo: "fld3X4eJ7n6DmxHOu",
  opcion: "fldQUkYhYHS6s1xGQ",
  evidencia: "flda9sG3L9zeKFkRd",
};

const F_REGLAS = {
  combinacion: "flddQpwPXZ37Hd3gW",
  resultado: "fldBiLAr3oXs7EoPk",
  palabrasClave: "fld9Hanc1ZQTJP97A",
  solucionAplicable: "fldvlHzDyRJSnRBDU",
  nivelRiesgo: "fldF30MVvuvytVKPR",
};

const F_SOLUCIONES = {
  nombre: "fld5gpvssqqLAA3NL",
  adaptacion: "fldW6aPxbBfJ5nl9L",
};

const F_BLOQUEOS = {
  nombre: "fldcnk9h2fRlOWgbL",
  comida: "fldJZUPv88bNwGc12",
  fecha: "fldJnrUtUjm0B6I1E",
  regla: "fldAdvbSweClMT0bH",
  registro: "fldDYcXSZbKKKZwNk",
};

const F_REGISTRO = {
  fecha: "fldhXNUiS6zbkyfwW",
  comida: "fldWHR0KR4k3pq70X",
  momento: "fldgxvMT73YIMoZ22",
  usuario: "fld3S0l46TCaGbEPy",
};

function normalizar(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function escapeRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function contienePalabraCompleta(textoNormalizado, clave) {
  const patron = new RegExp(`\\b${escapeRegex(clave)}\\b`);
  return patron.test(textoNormalizado);
}

// Evalúa una Regla contra el texto normalizado.
// Formato del campo "Palabras clave":
//   - Sin ";": lista simple, alcanza con que aparezca UNA cualquiera (regla de un solo alimento).
//   - Con UN ";": "Grupo A ; Grupo B" -> necesita al menos una palabra de CADA grupo (combinación real).
//   - Con DOS ";": "Grupo A ; Grupo B ; Disparadores" -> además de la combinación, cualquier
//     palabra de "Disparadores" alcanza sola (para platos compuestos que ya implican ambos, ej. "milanesa napolitana").
//   - Prefijo "TIP:" al inicio -> no es una alerta, es un tip positivo (no bloquea, se muestra distinto).
function evaluarRegla(textoNormalizado, palabrasClaveRaw) {
  let raw = (palabrasClaveRaw || "").trim();
  let esTip = false;
  if (/^tip:/i.test(raw)) {
    esTip = true;
    raw = raw.replace(/^tip:/i, "").trim();
  }

  const segmentos = raw
    .split(";")
    .map((seg) =>
      seg
        .split(",")
        .map((k) => normalizar(k.trim()))
        .filter(Boolean)
    )
    .filter((grupo) => grupo.length > 0);

  let coincide = false;
  if (segmentos.length <= 1) {
    const grupo = segmentos[0] || [];
    coincide = grupo.some((clave) => contienePalabraCompleta(textoNormalizado, clave));
  } else {
    const [grupoA, grupoB, disparadores] = segmentos;
    const matchA = grupoA.some((clave) => contienePalabraCompleta(textoNormalizado, clave));
    const matchB = grupoB.some((clave) => contienePalabraCompleta(textoNormalizado, clave));
    const matchDisparador = (disparadores || []).some((clave) => contienePalabraCompleta(textoNormalizado, clave));
    coincide = (matchA && matchB) || matchDisparador;
  }

  return { coincide, esTip };
}

const PALABRAS_CASERO = ["casera", "caseras", "casero", "caseros", "en casa", "hecho en casa", "hecha en casa"];

function esVersionCasera(textoNormalizado) {
  return PALABRAS_CASERO.some((p) => textoNormalizado.includes(normalizar(p)));
}

async function airtableFetch(path, apiKey, options = {}) {
  const resp = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error?.message || `Airtable respondió ${resp.status}`);
  }
  return data;
}

// Blindaje legal: bloquea el uso si no aceptó Términos, o si la cuenta fue suspendida.
const TABLA_USUARIOS = "tblJDf0WF5eCTWxLt";
const F_USUARIOS_ACCESO = { terminosAceptados: "fld2IGCUNz35rdAhh", suspendida: "fldZsandK60e6CpYB" };
async function verificarAcceso(usuarioId, apiKey) {
  const resp = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLA_USUARIOS}/${usuarioId}?returnFieldsByFieldId=true`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!resp.ok) return { ok: false, status: 404, error: "Usuario no encontrado." };
  const data = await resp.json();
  const f = data.fields || {};
  if (f[F_USUARIOS_ACCESO.suspendida] === true) {
    return { ok: false, status: 403, error: "Esta cuenta fue suspendida. Contactanos si creés que es un error." };
  }
  if (f[F_USUARIOS_ACCESO.terminosAceptados] !== true) {
    return { ok: false, status: 403, error: "Debés aceptar los Términos y Condiciones para continuar.", requiereTerminos: true };
  }
  return { ok: true };
}

async function fetchAllRecords(tableId, apiKey) {
  const records = [];
  let offset;
  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${tableId}`);
    url.searchParams.set("returnFieldsByFieldId", "true");
    if (offset) url.searchParams.set("offset", offset);
    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error?.message || `Airtable respondió ${resp.status}`);
    records.push(...(data.records || []));
    offset = data.offset;
  } while (offset);
  return records;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido, usar POST." });
    return;
  }

  const apiKey = process.env.AIRTABLE_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Falta configurar AIRTABLE_API_KEY." });
    return;
  }

  const { texto, momento, usuarioId } = req.body || {};
  if (!texto || typeof texto !== "string" || texto.trim().length === 0) {
    res.status(400).json({ error: "Falta el texto de la comida registrada." });
    return;
  }

  if (usuarioId) {
    const acceso = await verificarAcceso(usuarioId, apiKey);
    if (!acceso.ok) {
      return res.status(acceso.status).json({ error: acceso.error, requiereTerminos: acceso.requiereTerminos });
    }
  }

  try {
    const textoNormalizado = normalizar(texto);
    const versionCasera = esVersionCasera(textoNormalizado);

    // 1. Traer las Reglas con sus palabras clave
    const reglas = await fetchAllRecords(TABLE_REGLAS, apiKey);

    // 2. Buscar coincidencias: separamos bloqueos reales (combinaciones) de tips positivos
    const evaluaciones = reglas.map((r) => ({
      regla: r,
      ...evaluarRegla(textoNormalizado, r.fields[F_REGLAS.palabrasClave]),
    }));
    const coincidencias = evaluaciones.filter((e) => e.coincide && !e.esTip).map((e) => e.regla);
    const coincidenciasTip = evaluaciones.filter((e) => e.coincide && e.esTip).map((e) => e.regla);

    // 2b. Si el texto indica versión casera, esas coincidencias quedan "resueltas"
    // (ya se aplicó el hackeo) y no se tratan como bloqueo real.
    const bloqueosReales = versionCasera ? [] : coincidencias;
    const resueltos = versionCasera ? coincidencias : [];

    // 3. Crear el Registro Diario
    const fechaHoy = new Date().toISOString().split("T")[0];
    const registroCreado = await airtableFetch(TABLE_REGISTRO, apiKey, {
      method: "POST",
      body: JSON.stringify({
        records: [
          {
            fields: {
              [F_REGISTRO.fecha]: fechaHoy,
              [F_REGISTRO.comida]: texto,
              ...(momento ? { [F_REGISTRO.momento]: momento } : {}),
              ...(usuarioId ? { [F_REGISTRO.usuario]: [usuarioId] } : {}),
            },
          },
        ],
        typecast: true,
      }),
    });
    const registroId = registroCreado.records[0].id;

    // 4. Traer Soluciones (las necesitamos tanto para bloqueos reales como para resueltos)
    const soluciones = await fetchAllRecords(TABLE_SOLUCIONES, apiKey);
    const solucionesPorId = Object.fromEntries(soluciones.map((s) => [s.id, s.fields]));

    // 5. Si no hay coincidencias reales, no se crean Bloqueos en Airtable
    let bloqueosCreados = { records: [] };
    if (bloqueosReales.length > 0) {
      bloqueosCreados = await airtableFetch(TABLE_BLOQUEOS, apiKey, {
        method: "POST",
        body: JSON.stringify({
          records: bloqueosReales.map((r) => ({
            fields: {
              [F_BLOQUEOS.nombre]: r.fields[F_REGLAS.combinacion] || "Bloqueo detectado",
              [F_BLOQUEOS.comida]: texto,
              [F_BLOQUEOS.fecha]: fechaHoy,
              [F_BLOQUEOS.regla]: r.fields[F_REGLAS.combinacion] || "",
              [F_BLOQUEOS.registro]: [registroId],
            },
          })),
          typecast: true,
        }),
      });
    }

    // 6. Armar bloqueos reales con su solución
    const bloqueos = bloqueosReales.map((r, i) => {
      const solucionIds = r.fields[F_REGLAS.solucionAplicable] || [];
      const primeraSolucion = solucionIds.length ? solucionesPorId[solucionIds[0]] : null;
      return {
        combinacion: r.fields[F_REGLAS.combinacion] || "",
        resultado: r.fields[F_REGLAS.resultado] || "",
        nivelRiesgo: r.fields[F_REGLAS.nivelRiesgo] || "Bajo",
        solucion: primeraSolucion
          ? {
              nombre: primeraSolucion[F_SOLUCIONES.nombre] || "",
              adaptacion: primeraSolucion[F_SOLUCIONES.adaptacion] || "",
            }
          : null,
        bloqueoId: bloqueosCreados.records[i]?.id,
      };
    });

    // 7. Armar resueltos (versión casera) como refuerzo positivo, sin crear Bloqueo
    const resueltosRespuesta = resueltos.map((r) => {
      const solucionIds = r.fields[F_REGLAS.solucionAplicable] || [];
      const primeraSolucion = solucionIds.length ? solucionesPorId[solucionIds[0]] : null;
      return {
        combinacion: r.fields[F_REGLAS.combinacion] || "",
        mensaje: "Ya aplicaste este hackeo con la versión casera.",
        solucion: primeraSolucion
          ? {
              nombre: primeraSolucion[F_SOLUCIONES.nombre] || "",
              adaptacion: primeraSolucion[F_SOLUCIONES.adaptacion] || "",
            }
          : null,
      };
    });

    // 8. Tips positivos de Reglas (siempre se muestran, marcadas con "TIP:" en Airtable)
    let sugerencias = coincidenciasTip.map((r) => ({
      nombre: r.fields[F_REGLAS.combinacion] || "",
      mecanismo: r.fields[F_REGLAS.resultado] || "",
      opcion: "",
      evidencia: "",
    }));

    // 8b. Si no hay bloqueos reales, sumamos tips positivos en Alternativas locales
    // (comparación por palabra completa —con una raíz simple de plural—, no por substring:
    // esto evita que "ensalada" matchee por ser parte de "ensaladas").
    if (bloqueosReales.length === 0) {
      const alternativas = await fetchAllRecords(TABLE_ALTERNATIVAS, apiKey);
      const tokenizar = (t) => (t || "").split(/[^a-z0-9]+/).filter((p) => p.length > 3);
      const raiz = (p) => (p.length > 4 && p.endsWith("s") ? p.slice(0, -1) : p);
      // Palabras genéricas que no identifican a un alimento específico: si matchean solas,
      // generan falsos positivos (ej. "ensalada" enganchando la ficha de la lechuga).
      const GENERICAS = new Set([
        "ensalada", "ensaladas", "comida", "comidas", "plato", "platos", "alimento",
        "alimentos", "base", "fresca", "fresco", "frescos", "frescas", "opcion",
        "opciones", "saludable", "saludables", "diaria", "diario", "buena", "bueno",
        "aporte", "util", "utiles",
      ].map(raiz));
      const coincidenciasAlternativas = alternativas.filter((a) => {
        const candidatos = new Set([
          ...tokenizar(normalizar(a.fields[F_ALTERNATIVAS.nombre] || "")).map(raiz),
          ...tokenizar(normalizar(a.fields[F_ALTERNATIVAS.opcion] || "")).map(raiz),
        ]);
        const palabrasTexto = tokenizar(textoNormalizado)
          .map(raiz)
          .filter((p) => !GENERICAS.has(p));
        return palabrasTexto.some((p) => candidatos.has(p) && !GENERICAS.has(p));
      });
      sugerencias = sugerencias.concat(
        coincidenciasAlternativas.slice(0, 2).map((a) => ({
          nombre: a.fields[F_ALTERNATIVAS.nombre] || "",
          mecanismo: a.fields[F_ALTERNATIVAS.mecanismo] || "",
          opcion: a.fields[F_ALTERNATIVAS.opcion] || "",
          evidencia: a.fields[F_ALTERNATIVAS.evidencia] || "",
        }))
      );
    }

    res.status(200).json({ registroId, bloqueos, resueltos: resueltosRespuesta, sugerencias });
  } catch (err) {
    res.status(500).json({ error: "Error procesando el registro", detail: String(err) });
  }
}
