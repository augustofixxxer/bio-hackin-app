// api/login-google.js
// Recibe POST con { credential } (el JWT que entrega el botón de Google).
// Verifica ese token contra los servidores de Google, y busca o crea
// al usuario correspondiente en la tabla "usuarios" de Supabase.
//
// AUTENTICACIÓN REAL DE SESIÓN (ST-01, implementado 29/07/2026): además de
// usuarioId/email/nombre, ahora devuelve "pase" — un token firmado (ver
// _sesion.js) que el frontend debe reenviar en cada pedido protegido de
// ahora en más. Es la única puerta de entrada donde se emite un pase nuevo.

import { emitirPase } from "./_sesion.js";

const GOOGLE_CLIENT_ID = "521828227436-s3qcdgb7ivd9aaaqifm1c20nat8ntcj1.apps.googleusercontent.com";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_AUTH_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || SUPABASE_KEY;

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
  if (!process.env.SESSION_SECRET) {
    return res.status(500).json({ error: "Falta configurar SESSION_SECRET." });
  }

  const { credential, email: testEmail, password: testPassword } = req.body || {};

  // Acceso de prueba exclusivo para Preview. Producción mantiene Google OAuth.
  if (testEmail || testPassword) {
    if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "preview") {
      return res.status(404).json({ error: "Acceso de prueba no disponible fuera de Preview." });
    }
    if (!testEmail || typeof testEmail !== "string" || !testPassword || typeof testPassword !== "string") {
      return res.status(400).json({ error: "Ingresá correo y contraseña." });
    }

    try {
      const authResp = await fetch(
        `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
        {
          method: "POST",
          headers: {
            apikey: SUPABASE_AUTH_KEY,
            Authorization: `Bearer ${SUPABASE_AUTH_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email: testEmail.trim(), password: testPassword }),
        }
      );
      const authText = await authResp.text();
      const authData = authText ? JSON.parse(authText) : null;

      if (!authResp.ok || !authData?.user?.id) {
        return res.status(401).json({ error: "Correo o contraseña incorrectos." });
      }

      const email = String(authData.user.email || testEmail).trim().toLowerCase();
      const nombre =
        authData.user.user_metadata?.name ||
        authData.user.user_metadata?.full_name ||
        email;

      const encontrados = await supabaseFetch(
        `usuarios?email=eq.${encodeURIComponent(email)}&select=id,email,nombre_alias,nivel_acceso`
      );

      let usuarioId;
      let nivelAcceso = "gratuito";

      if (encontrados.length > 0) {
        usuarioId = encontrados[0].id;
        nivelAcceso = encontrados[0].nivel_acceso || "gratuito";
      } else {
        const creado = await supabaseFetch("usuarios", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ email, nombre_alias: nombre }),
        });
        usuarioId = creado[0].id;
      }

      const pase = emitirPase(usuarioId);
      return res.status(200).json({ usuarioId, email, nombre, pase, nivelAcceso });
    } catch (err) {
      console.error("Error en acceso de prueba:", err);
      return res.status(500).json({ error: "Error procesando el acceso de prueba." });
    }
  }

  if (!credential || typeof credential !== "string") {
    return res.status(400).json({ error: "Falta el token de Google (credential)." });
  }

  try {
    // 1. Verificar el token contra los servidores de Google
    const verifyResp = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
    );
    const payload = await verifyResp.json();

    if (!verifyResp.ok || payload.error) {
      return res.status(401).json({ error: "Token de Google inválido o vencido." });
    }
    if (payload.aud !== GOOGLE_CLIENT_ID) {
      return res.status(401).json({ error: "El token no corresponde a esta app." });
    }

    const email = payload.email;
    const nombre = payload.name || payload.given_name || email;
    if (!email) {
      return res.status(400).json({ error: "Google no devolvió un email válido." });
    }

    // 2. Buscar si ya existe un usuario con ese email
    const encontrados = await supabaseFetch(
      `usuarios?email=eq.${encodeURIComponent(email)}&select=id,email,nombre_alias,nivel_acceso`
    );

    let usuarioId;
    let nivelAcceso = "gratuito";

    if (encontrados.length > 0) {
      // Ya existe: lo usamos tal cual
      usuarioId = encontrados[0].id;
      nivelAcceso = encontrados[0].nivel_acceso || "gratuito";
    } else {
      // No existe: lo creamos
      const creado = await supabaseFetch(`usuarios`, {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          email,
          nombre_alias: nombre,
        }),
      });
      usuarioId = creado[0].id;
    }

    // 3. Emitir el pase de sesión — esto es lo nuevo. De acá en más, el frontend
    // debe mandar este pase (no solo el usuarioId) en cada pedido protegido.
    const pase = emitirPase(usuarioId);

    return res.status(200).json({ usuarioId, email, nombre, pase, nivelAcceso });
  } catch (err) {
    console.error("Error en login-google:", err);
    return res.status(500).json({ error: "Error procesando el login", detail: String(err) });
  }
}
// END: /api/login-google.js
