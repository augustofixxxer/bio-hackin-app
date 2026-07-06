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

  try {
    const textoNormalizado = normalizar(texto);
    const versionCasera = esVersionCasera(textoNormalizado);

    // 1. Traer las Reglas con sus palabras clave
    const reglas = await fetchAllRecords(TABLE_REGLAS, apiKey);

    // 2. Buscar coincidencias
    const coincidencias = reglas.filter((r) => {
      const claves = r.fields[F_REGLAS.palabrasClave] || "";
      return claves
        .split(",")
        .map((k) => normalizar(k.trim()))
        .filter(Boolean)
        .some((clave) => textoNormalizado.includes(clave));
    });

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

    // 8. Si no hay bloqueos reales, buscar tips positivos en Alternativas locales
    // (matching simple por texto, ya que esa tabla no tiene un campo de palabras clave dedicado).
    let sugerencias = [];
    if (bloqueosReales.length === 0) {
      const alternativas = await fetchAllRecords(TABLE_ALTERNATIVAS, apiKey);
      const coincidenciasAlternativas = alternativas.filter((a) => {
        const texto1 = normalizar(a.fields[F_ALTERNATIVAS.nombre] || "");
        const texto2 = normalizar(a.fields[F_ALTERNATIVAS.opcion] || "");
        return textoNormalizado
          .split(/\s+/)
          .filter((palabra) => palabra.length > 3)
          .some((palabra) => texto1.includes(palabra) || texto2.includes(palabra));
      });
      sugerencias = coincidenciasAlternativas.slice(0, 2).map((a) => ({
        nombre: a.fields[F_ALTERNATIVAS.nombre] || "",
        mecanismo: a.fields[F_ALTERNATIVAS.mecanismo] || "",
        opcion: a.fields[F_ALTERNATIVAS.opcion] || "",
        evidencia: a.fields[F_ALTERNATIVAS.evidencia] || "",
      }));
    }

    res.status(200).json({ registroId, bloqueos, resueltos: resueltosRespuesta, sugerencias });
  } catch (err) {
    res.status(500).json({ error: "Error procesando el registro", detail: String(err) });
  }
}
