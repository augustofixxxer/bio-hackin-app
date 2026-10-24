// api/login-google.js
// Verifica la credencial de Google, resuelve una única cuenta por email y emite
// un pase de sesión firmado solo después de validar la identidad.

import { emitirPase } from "./_sesion.js";
import { supabaseFetch, SUPABASE_URL, SUPABASE_KEY } from "./_supabase.js";

const GOOGLE_CLIENT_ID = "521828227436-s3qcdgb7ivd9aaaqifm1c20nat8ntcj1.apps.googleusercontent.com";

function escaparIlike(valor) {
  return String(valor).replace(/[\\%_*]/g, (c) => "\\" + c);
}

function premiumVigente(u) {
  if (!u || u.cuenta_suspendida === true || u.terminos_aceptados !== true) return false;
  if (u.nivel_acceso !== "Premium") return false;
  return !u.premium_until || Date.parse(u.premium_until) > Date.now();
}

async function buscarUsuario(email) {
  const crudos = await supabaseFetch(
    `usuarios?email=ilike.${encodeURIComponent(escaparIlike(email))}&select=id,email,nivel_acceso,premium_until,cuenta_suspendida,terminos_aceptados&limit=5`
  );
  return (Array.isArray(crudos) ? crudos : []).filter(
    (u) => String(u.email || "").trim().toLowerCase() === email
  );
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

  const { credential } = req.body || {};
  if (!credential || typeof credential !== "string" || credential.length > 4096) {
    return res.status(400).json({ error: "Falta el token de Google (credential)." });
  }

  try {
    const verifyResp = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const payload = await verifyResp.json();

    if (!verifyResp.ok || payload.error) {
      return res.status(401).json({ error: "Token de Google inválido o vencido." });
    }
    if (payload.aud !== GOOGLE_CLIENT_ID) {
      return res.status(401).json({ error: "El token no corresponde a esta app." });
    }
    if (payload.iss !== "https://accounts.google.com" && payload.iss !== "accounts.google.com") {
      return res.status(401).json({ error: "Emisor de token no válido." });
    }
    if (String(payload.email_verified) !== "true") {
      return res.status(401).json({ error: "Tu cuenta de Google no tiene el email verificado." });
    }

    const email = String(payload.email || "").trim().toLowerCase();
    const nombre = String(payload.name || payload.given_name || email).slice(0, 100);
    if (!email) {
      return res.status(400).json({ error: "Google no devolvió un email válido." });
    }

    let encontrados = await buscarUsuario(email);
    if (!encontrados.length) {
      try {
        await supabaseFetch("usuarios", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ email, nombre_alias: nombre }),
        });
      } catch (errCreacion) {
        // Puede ser una carrera entre dos logins; la unicidad de email normalizado
        // en PostgreSQL decide cuál inserción gana. Luego volvemos a resolver la cuenta.
        console.error("[login-google] creación de usuario fallida, se reintenta:", errCreacion?.message);
      }
      encontrados = await buscarUsuario(email);
    }

    if (encontrados.length !== 1) {
      return res.status(500).json({ error: "No pudimos completar el ingreso. Probá de nuevo." });
    }

    const u = encontrados[0];
    if (u.cuenta_suspendida === true) {
      return res.status(403).json({ error: "Esta cuenta fue suspendida. Contactanos si creés que es un error." });
    }

    const pase = emitirPase(u.id);
    return res.status(200).json({
      usuarioId: u.id,
      email,
      nombre,
      pase,
      nivelAcceso: premiumVigente(u) ? "Premium" : "gratuito",
    });
  } catch (err) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      return res.status(504).json({ error: "Google no respondió a tiempo. Probá de nuevo." });
    }
    console.error("Error en login-google:", err);
    return res.status(500).json({ error: "Error procesando el login" });
  }
}
