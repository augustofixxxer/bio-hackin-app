// api/lista-espera-premium.js
// POST { email } (usuario identificado vía "pase" en Authorization) — guarda el interés en
// Premium en la tabla lista_espera_premium. NO dispara ningún cobro — Mercado Pago sigue
// pausado por decisión de Fundador (ver DMT, Sección 9). Es exclusivamente para poder
// avisar por email cuando la suscripción esté disponible.
//
// lista_espera_premium NO tiene FK a usuarios (mismo criterio deliberado que
// log_aceptacion_terminos / log_consentimiento_riesgo): es un registro de interés
// comercial, no un dato de uso del producto — api/borrar-datos.js no debe tocar esta tabla.

import { usuarioIdDesdeRequest } from "./_sesion.js";

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

function emailValido(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido, usar POST." });
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: "Falta configurar SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY." });
  }

  const usuarioId = usuarioIdDesdeRequest(req);
  if (!usuarioId) {
    return res.status(401).json({ error: "Sesión inválida o vencida. Volvé a iniciar sesión." });
  }

  const { email } = req.body || {};
  if (!emailValido(email)) {
    return res.status(400).json({ error: "Ingresá un email válido." });
  }

  try {
    await supabaseFetch(`lista_espera_premium`, {
      method: "POST",
      body: JSON.stringify({
        usuario_id: usuarioId,
        email: email.trim(),
      }),
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Error en lista-espera-premium:", err);
    return res.status(500).json({ error: "Error guardando tu email", detail: String(err) });
  }
}
// END: /api/lista-espera-premium.js
