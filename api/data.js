// Función serverless (Vercel). Corre en el servidor, nunca en el navegador del usuario.
// La API key de Airtable vive acá, en una variable de entorno — nunca se manda al cliente.

const BASE_ID = "appVzRFXuykP2ZBvR";
const TABLE_REGLAS = "tblQHXCCsWei8zXAl";
const TABLE_ALTERNATIVAS = "tblfzFS6VHCfMdmAJ";

// IDs de campo reales de tu base (no cambian aunque renombres las columnas en Airtable).
const F_REGLAS = {
  combinacion: "flddQpwPXZ37Hd3gW",
  resultado: "fldBiLAr3oXs7EoPk",
  objetivo: "fldvljkiVRCBrGrsa",
  acceso: "fldL9TZbhKCqXFyLF",
  evidencia: "fldO7A66ExpwxYUKS",
  mecanismo: "fld7VhiXRjdPJMmqA",
};

const F_ALT = {
  nombre: "fld0iRCHDJKPyAkr7",
  categoria: "fld3X4eJ7n6DmxHOu",
  opcion: "fldQUkYhYHS6s1xGQ",
  frecuencia: "fldbVH0gwdk6ppifF",
  nutriente: "fldgAm7SHAW3KrDLX",
  tipo: "fldQK99XpHgyUeG4W",
};

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
    if (!resp.ok) {
      throw new Error(`Airtable respondió ${resp.status} para la tabla ${tableId}`);
    }
    const data = await resp.json();
    records.push(...(data.records || []));
    offset = data.offset;
  } while (offset);
  return records;
}

export default async function handler(req, res) {
  const apiKey = process.env.AIRTABLE_API_KEY;

  if (!apiKey) {
    res.status(500).json({
      error: "Falta configurar AIRTABLE_API_KEY como variable de entorno en Vercel.",
    });
    return;
  }

  try {
    const [reglas, alternativas] = await Promise.all([
      fetchAllRecords(TABLE_REGLAS, apiKey),
      fetchAllRecords(TABLE_ALTERNATIVAS, apiKey),
    ]);

    const entradasReglas = reglas.map((r) => {
      const f = r.fields;
      return {
        id: r.id,
        tipo: "regla",
        combinacion: f[F_REGLAS.combinacion] || "",
        resultado: f[F_REGLAS.resultado] || "",
        categorias: (f[F_REGLAS.objetivo] || []).map((c) => c.name),
        evidencia: f[F_REGLAS.evidencia]?.name || null,
        mecanismo: f[F_REGLAS.mecanismo]?.name || null,
        acceso: f[F_REGLAS.acceso]?.name || null,
      };
    });

    const entradasAlternativas = alternativas.map((r) => {
      const f = r.fields;
      const esProtocolo = f[F_ALT.tipo]?.name === "Protocolo";
      return {
        id: r.id,
        tipo: esProtocolo ? "protocolo" : "alternativa",
        combinacion: f[F_ALT.nombre] || "",
        resultado: f[F_ALT.opcion] || "",
        mecanismo: f[F_ALT.categoria] || null,
        frecuencia: f[F_ALT.frecuencia] || null,
        nutriente: f[F_ALT.nutriente] || null,
        categorias: [],
        evidencia: null,
      };
    });

    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=300");
    res.status(200).json({
      entradas: [...entradasReglas, ...entradasAlternativas],
      actualizado: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: "Error consultando Airtable", detail: String(err) });
  }
}
