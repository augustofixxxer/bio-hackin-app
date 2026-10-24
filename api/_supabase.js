// api/_supabase.js
// Cliente REST compartido por los endpoints serverless. Todas las consultas tienen
// timeout por defecto y errores/respuestas se normalizan en un único punto.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function supabaseFetch(path, options = {}) {
  let resp;
  let text;
  const signal = options.signal || AbortSignal.timeout(8000);

  try {
    resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...options,
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      signal,
    });
    // Leer el body dentro del try: la respuesta también puede agotarse después
    // de que fetch() haya resuelto sus headers.
    text = await resp.text();
  } catch (err) {
    if (err?.name === "TimeoutError") {
      throw new Error("Supabase no respondió a tiempo (límite de 8 segundos).");
    }
    if (err?.name === "AbortError") {
      throw new Error("La consulta a Supabase fue cancelada o agotó su tiempo.");
    }
    throw new Error("No se pudo conectar con Supabase.");
  }

  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (resp.ok) {
        throw new Error("Supabase devolvió una respuesta que no es JSON.");
      }
    }
  }

  if (!resp.ok) {
    throw new Error((data && (data.message || data.error || data.details)) || `Supabase respondió ${resp.status}`);
  }
  return data;
}

export { supabaseFetch, SUPABASE_URL, SUPABASE_KEY };
