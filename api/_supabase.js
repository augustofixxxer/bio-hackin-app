// api/_supabase.js
// BT-02 — Unificación de la conexión a Supabase duplicada entre archivos de api/.
// Mismo patrón que _instrumentacion.js: archivo único dentro de api/ (nunca en lib/,
// lección Sprint 16 — un require/import entre carpetas falló dos veces en producción
// en este pipeline de deploy manual). Prefijo "_" para que Vercel no lo trate como
// endpoint HTTP propio.
//
// Sin cambios de comportamiento respecto de las copias que reemplaza: mismo armado
// de headers, mismo manejo de 204 sin body (siempre res.text() antes de JSON.parse).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function supabaseFetch(path, options = {}) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await resp.text();
  const data = text ? JSON.parse(text) : null;
  if (!resp.ok) {
    throw new Error((data && (data.message || data.error)) || `Supabase respondió ${resp.status}`);
  }
  return data;
}

export { supabaseFetch, SUPABASE_URL, SUPABASE_KEY };
