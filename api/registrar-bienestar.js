// api/registrar-bienestar.js
// Recibe POST con { energia, animo, sueno, digestion, usuarioId } (1-5 cada uno)
// y crea un registro en la tabla "bienestar_diario_real", vinculado al usuario.

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

function validarEscala(valor) {
  return ["1", "2", "3", "4", "5"].includes(String(valor));
}

// Blindaje legal: bloquea el uso si no aceptó Términos, o si la cuenta fue suspendida.
async function verificarAcceso(usuarioId) {
  const rows = await supabaseFetch(
    `usuarios?id=eq.${usuarioId}&select=cuenta_suspendida,terminos_aceptados`
  );
  if (!rows.length) return { ok: false, status: 404, error: "Usuario no encontrado." };
  const u = rows[0];
  if (u.cuenta_suspendida === true) {
    return { ok: false, status: 403, error: "Esta cuenta fue suspendida. Contactanos si creés que es un error." };
  }
  if (u.terminos_aceptados !== true) {
    return { ok: false, status: 403, error: "Debés aceptar los Términos y Condiciones para continuar.", requiereTerminos: true };
  }
  return { ok: true };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido, usar POST." });
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: "Falta configurar SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY." });
  }

  const { energia, animo, sueno, digestion, usuarioId } = req.body || {};

  for (const [nombre, valor] of Object.entries({ energia, animo, sueno, digestion })) {
    if (!validarEscala(valor)) {
      return res.status(400).json({ error: `El valor de "${nombre}" debe ser un número del 1 al 5.` });
    }
  }
  if (!usuarioId || typeof usuarioId !== "string") {
    return res.status(400).json({ error: "Falta el usuarioId." });
  }

  try {
    const acceso = await verificarAcceso(usuarioId);
    if (!acceso.ok) {
      return res.status(acceso.status).json({ error: acceso.error, requiereTerminos: acceso.requiereTerminos });
    }
  } catch (err) {
    return res.status(400).json({ error: "El usuarioId recibido no es válido.", detail: String(err) });
  }

  try {
    const creado = await supabaseFetch(`bienestar_diario_real`, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        fecha_hora: new Date().toISOString(),
        usuario_id: usuarioId,
        energia: Number(energia),
        animo: Number(animo),
        sueno: Number(sueno),
        digestion: Number(digestion),
      }),
    });

    return res.status(200).json({ ok: true, id: creado[0].id });
  } catch (err) {
    console.error("Error en registrar-bienestar:", err);
    return res.status(500).json({ error: "Error procesando el registro de bienestar", detail: String(err) });
  }
}
