// api/login-password.js
// Acceso de prueba aislado para Vercel Preview.
// No reemplaza ni modifica el login Google de producción.
//
// Seguridad:
// - Solo responde cuando VERCEL_ENV=preview (o fuera de Vercel para desarrollo local).
// - La contraseña se envía por HTTPS al endpoint de Supabase Auth y nunca se persiste.
// - El access token de Supabase se usa solo para validar credenciales; la app continúa
//   utilizando su pase interno firmado, igual que el flujo Google.

import { emitirPase } from "./_sesion.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_AUTH_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function supabaseFetch(path, options = {}) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
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

  // Este endpoint existe únicamente para destrabar la prueba de Preview.
  // Producción conserva exclusivamente el flujo Google actual.
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "preview") {
    return res.status(404).json({ error: "Ruta no disponible fuera de Preview." });
  }

  if (!SUPABASE_URL || !SUPABASE_AUTH_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "Falta configuración de Supabase para el acceso de prueba." });
  }
  if (!process.env.SESSION_SECRET) {
    return res.status(500).json({ error: "Falta configurar SESSION_SECRET." });
  }

  const { email, password } = req.body || {};
  if (!email || typeof email !== "string" || !password || typeof password !== "string") {
    return res.status(400).json({ error: "Ingresá correo y contraseña." });
  }

  try {
    // 1. Validar credenciales contra Supabase Auth.
    const authResp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_AUTH_KEY,
        Authorization: `Bearer ${SUPABASE_AUTH_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: email.trim(), password }),
    });

    const authText = await authResp.text();
    const authData = authText ? JSON.parse(authText) : null;

    if (!authResp.ok || !authData?.user?.id) {
      return res.status(401).json({ error: "Correo o contraseña incorrectos." });
    }

    // 2. Vincular el usuario autenticado con la tabla propia de la app.
    const normalizedEmail = String(authData.user.email || email).trim().toLowerCase();
    const encontrados = await supabaseFetch(
      `usuarios?email=eq.${encodeURIComponent(normalizedEmail)}&select=id,email,nombre_alias,nivel_acceso`
    );

    let usuarioId;
    let nivelAcceso = "gratuito";
    let nombre = authData.user.user_metadata?.name || authData.user.user_metadata?.full_name || normalizedEmail;

    if (encontrados.length > 0) {
      usuarioId = encontrados[0].id;
      nivelAcceso = encontrados[0].nivel_acceso || "gratuito";
      nombre = encontrados[0].nombre_alias || nombre;
    } else {
      const creado = await supabaseFetch("usuarios", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          email: normalizedEmail,
          nombre_alias: nombre,
        }),
      });
      usuarioId = creado[0].id;
    }

    // 3. Emitir el mismo pase interno que usa login-google.
    const pase = emitirPase(usuarioId);

    return res.status(200).json({
      usuarioId,
      email: normalizedEmail,
      nombre,
      pase,
      nivelAcceso,
    });
  } catch (err) {
    console.error("Error en login-password:", err);
    return res.status(500).json({ error: "Error procesando el acceso de prueba." });
  }
}
// END: /api/login-password.js
