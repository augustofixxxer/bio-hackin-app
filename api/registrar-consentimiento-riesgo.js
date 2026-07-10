// api/registrar-consentimiento-riesgo.js
// Recibe POST con { usuarioId, bloqueo, nivelRiesgo } y crea un log inmutable
// cada vez que un usuario confirma haber leído un bloqueo de riesgo Medio/Alto/Experimental.

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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido, usar POST." });
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: "Falta configurar SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY." });
  }

  const { usuarioId, bloqueo, nivelRiesgo } = req.body || {};
  if (!usuarioId || !bloqueo || !nivelRiesgo) {
    return res.status(400).json({ error: "Faltan datos (usuarioId, bloqueo, nivelRiesgo)." });
  }

  try {
    await supabaseFetch(`log_consentimiento_riesgo`, {
      method: "POST",
      body: JSON.stringify({
        usuario_id: usuarioId,
        bloqueo_regla: bloqueo,
        nivel_riesgo: nivelRiesgo,
        fecha: new Date().toISOString(),
      }),
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Error en registrar-consentimiento-riesgo:", err);
    return res.status(500).json({ error: "Error registrando el consentimiento", detail: String(err) });
  }
}
