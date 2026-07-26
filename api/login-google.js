// api/login-google.js
// Recibe POST con { credential } (el JWT que entrega el botón de Google).
// Verifica ese token contra los servidores de Google, y busca o crea
// al usuario correspondiente en la tabla "usuarios" de Supabase.

// MIS Etapa 2 — Integración de Trazabilidad. No intrusivo: emitirEvento nunca lanza,
// un fallo interno se loguea y se descarta (mismo patrón que registrar-comida.js).
import { emitirEvento } from "./_instrumentacion.js";
// BT-02 — conexión a Supabase unificada (ver api/_supabase.js).
import { supabaseFetch, SUPABASE_URL, SUPABASE_KEY } from "./_supabase.js";

const GOOGLE_CLIENT_ID = "521828227436-s3qcdgb7ivd9aaaqifm1c20nat8ntcj1.apps.googleusercontent.com";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido, usar POST." });
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: "Falta configurar SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY." });
  }

  const { credential } = req.body || {};
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
      `usuarios?email=eq.${encodeURIComponent(email)}&select=id,email,nombre_alias`
    );

    let usuarioId;
    let esNuevo = false;

    if (encontrados.length > 0) {
      // Ya existe: lo usamos tal cual
      usuarioId = encontrados[0].id;
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
      esNuevo = true;
    }

    await emitirEvento({
      usuarioId,
      eventType: esNuevo ? "usuario_creado_login_google" : "login_google",
      sourceComponent: "login-google",
      requestingComponent: "login-google",
      payload: { esNuevo },
    });

    return res.status(200).json({ usuarioId, email, nombre });
  } catch (err) {
    console.error("Error en login-google:", err);
    return res.status(500).json({ error: "Error procesando el login", detail: String(err) });
  }
}
// END: /api/login-google.js
