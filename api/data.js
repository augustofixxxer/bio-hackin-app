// Función serverless (Vercel). Corre en el servidor, nunca en el navegador del usuario.
// Alimenta el "Explorador por problemática": trae Reglas y Alternativas locales
// y las devuelve en un único formato combinado.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function supabaseFetch(path) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
  });
  const text = await resp.text();
  const data = text ? JSON.parse(text) : null;
  if (!resp.ok) {
    throw new Error((data && (data.message || data.error)) || `Supabase respondió ${resp.status}`);
  }
  return data;
}

export default async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    res.status(500).json({
      error: "Falta configurar SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY como variable de entorno en Vercel.",
    });
    return;
  }

  try {
    const [reglas, alternativas] = await Promise.all([
      supabaseFetch(
        `reglas?select=id,combinacion,resultado,objetivo_afectado,nivel_evidencia,mecanismo_base,nivel_acceso`
      ),
      supabaseFetch(
        `alternativas_locales?select=id,mecanismo,descripcion_mecanismo,recomendacion,frecuencia_dosis,compuesto_activo,tipo,objetivo,nivel_evidencia`
      ),
    ]);

    const entradasReglas = reglas.map((r) => ({
      id: r.id,
      tipo: "regla",
      combinacion: r.combinacion || "",
      resultado: r.resultado || "",
      categorias: r.objetivo_afectado || [],
      evidencia: r.nivel_evidencia || null,
      mecanismo: r.mecanismo_base || null,
      acceso: r.nivel_acceso || null,
    }));

    const entradasAlternativas = alternativas.map((a) => {
      const esProtocolo = a.tipo === "Protocolo";
      return {
        id: a.id,
        tipo: esProtocolo ? "protocolo" : "alternativa",
        combinacion: a.mecanismo || "",
        resultado: a.recomendacion || "",
        mecanismo: a.descripcion_mecanismo || null,
        frecuencia: a.frecuencia_dosis || null,
        nutriente: a.compuesto_activo || null,
        categorias: a.objetivo || [],
        evidencia: a.nivel_evidencia || null,
      };
    });

    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=300");
    res.status(200).json({
      entradas: [...entradasReglas, ...entradasAlternativas],
      actualizado: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: "Error consultando Supabase", detail: String(err) });
  }
}
