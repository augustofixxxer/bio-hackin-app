// Función serverless (Vercel). Recibe POST con { texto, momento }.
// Detecta coincidencias con las Reglas por palabras clave, crea el Registro Diario
// y los Bloqueos correspondientes en Airtable.

const BASE_ID = "appVzRFXuykP2ZBvR";
const TABLE_REGLAS = "tblQHXCCsWei8zXAl";
const TABLE_SOLUCIONES = "tbl8iPAmQpW0KxB8X";
const TABLE_BLOQUEOS = "tblfYPLNnJDvStK3q";
const TABLE_REGISTRO = "tblHYg7bZCVvgiEOe";

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
};

function normalizar(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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

  const { texto, momento } = req.body || {};
  if (!texto || typeof texto !== "string" || texto.trim().length === 0) {
    res.status(400).json({ error: "Falta el texto de la comida registrada." });
    return;
  }

  try {
    const textoNormalizado = normalizar(texto);

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
            },
          },
        ],
        typecast: true,
      }),
    });
    const registroId = registroCreado.records[0].id;

    // 4. Si no hay coincidencias, devolver directo
    if (coincidencias.length === 0) {
      res.status(200).json({ registroId, bloqueos: [] });
      return;
    }

    // 5. Traer Soluciones para poder mostrar la recomendación de cada bloqueo
    const soluciones = await fetchAllRecords(TABLE_SOLUCIONES, apiKey);
    const solucionesPorId = Object.fromEntries(soluciones.map((s) => [s.id, s.fields]));

    // 6. Crear un Bloqueo por cada Regla que matcheó
    const bloqueosCreados = await airtableFetch(TABLE_BLOQUEOS, apiKey, {
      method: "POST",
      body: JSON.stringify({
        records: coincidencias.map((r) => ({
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

    // 7. Armar la respuesta con el detalle de cada bloqueo + su solución
    const bloqueos = coincidencias.map((r, i) => {
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

    res.status(200).json({ registroId, bloqueos });
  } catch (err) {
    res.status(500).json({ error: "Error procesando el registro", detail: String(err) });
  }
      }
