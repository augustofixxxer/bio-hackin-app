// api/aceptar-terminos.js
// Recibe POST con { usuarioId, condicionMedica? } y:
// 1) marca terminos_aceptados = true en usuarios (guarda condicion_medica_preexistente si vino)
// 2) crea un registro inmutable en "log_aceptacion_terminos" con fecha UTC, versión e IP.

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
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.message || data.error || `Supabase respondió ${resp.status}`);
  }
  return data;
}

// Subí este número cada vez que cambies el texto legal de los Términos —
// así el log queda trazable a qué versión aceptó cada usuario.
const VERSION_TERMINOS_ACTUAL = "1.0";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido, usar POST." });
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: "Falta configurar SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY." });
  }

  const { usuarioId, condicionMedica } = req.body || {};
  if (!usuarioId || typeof usuarioId !== "string") {
    return res.status(400).json({ error: "Falta usuarioId." });
  }

  const ipHeader = req.headers["x-forwarded-for"] || "";
  const ip = String(ipHeader).split(",")[0].trim() || req.socket?.remoteAddress || "desconocida";

  try {
    await supabaseFetch(`usuarios?id=eq.${usuarioId}`, {
      method: "PATCH",
      body: JSON.stringify({
        terminos_aceptados: true,
        ...(typeof condicionMedica === "boolean" ? { condicion_medica_preexistente: condicionMedica } : {}),
      }),
    });

    await supabaseFetch(`log_aceptacion_terminos`, {
      method: "POST",
      body: JSON.stringify({
        usuario_id: usuarioId,
        fecha_utc: new Date().toISOString(),
        version_terminos: VERSION_TERMINOS_ACTUAL,
        ip_address: ip,
      }),
    });

    return res.status(200).json({ ok: true, version: VERSION_TERMINOS_ACTUAL });
  } catch (err) {
    console.error("Error en aceptar-terminos:", err);
    return res.status(500).json({ error: "Error registrando la aceptación de términos", detail: String(err) });
  }
}
