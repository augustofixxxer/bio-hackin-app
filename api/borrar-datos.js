// api/borrar-datos.js
// Derecho al olvido: sesión firmada o verificación de titularidad por email.
import { randomBytes, createHash } from "crypto";
import { emitirEvento } from "./_instrumentacion.js";
import { supabaseFetch, SUPABASE_URL, SUPABASE_KEY } from "./_supabase.js";
import { usuarioIdDesdeRequest } from "./_sesion.js";

const emailValido = (v) => typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const respuestaGenerica = { ok: true, modo: "verificacion_pendiente", mensaje: "Si existe una cuenta con ese email, te enviaremos instrucciones para confirmar la solicitud de eliminación." };

async function enviarEmailBorrado(email, link) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.BORRADO_EMAIL_FROM;
  if (!apiKey || !from || !process.env.APP_BASE_URL) throw new Error("Falta configurar el proveedor de email o APP_BASE_URL.");
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Confirmá la solicitud de eliminación de Reseteo Propio",
      text: `Recibimos una solicitud para eliminar tu cuenta de Reseteo Propio. Para confirmar, abrí este enlace y presioná el botón de confirmación: ${link}\n\nEl enlace vence en 48 horas. Si no hiciste esta solicitud, ignorá este correo; no se eliminará tu cuenta.`,
    }),
  });
  if (!resp.ok) throw new Error(`El proveedor de email respondió ${resp.status}`);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: "Falta configurar Supabase." });

  const { email } = req.body || {};
  if (!emailValido(email)) return res.status(400).json({ error: "Ingresá un email válido." });

  const usuarioId = usuarioIdDesdeRequest(req);
  const emailNormalizado = email.trim().toLowerCase();

  try {
    if (usuarioId) {
      const usuarios = await supabaseFetch(`usuarios?id=eq.${encodeURIComponent(usuarioId)}&select=id,email`);
      if (!usuarios.length) return res.status(401).json({ error: "La sesión ya no corresponde a una cuenta activa." });
      if (emailNormalizado !== String(usuarios[0].email || "").trim().toLowerCase()) {
        return res.status(403).json({ error: "El email no coincide con la cuenta autenticada. No se borró ningún dato." });
      }
      await emitirEvento({ usuarioId, eventType: "borrado_datos_solicitado", sourceComponent: "borrar-datos", requestingComponent: "borrar-datos", payload: { metodo: "sesion" } });
      // Esta FK es NO ACTION, no CASCADE: quitar el mapa después de registrar el evento y antes del usuario.\n      await supabaseFetch(`usuario_subject_map?usuario_id=eq.${encodeURIComponent(usuarioId)}`, { method: "DELETE" });\n      await supabaseFetch(`usuarios?id=eq.${encodeURIComponent(usuarioId)}`, { method: "DELETE" });
      return res.status(200).json({ ok: true, mensaje: "La cuenta autenticada y sus datos asociados fueron eliminados de forma permanente." });
    }

    // Sin sesión: respuesta genérica para no revelar si el email está registrado.
    // Si no hay email operativo configurado, no se crea una solicitud inutilizable.
    if (!process.env.RESEND_API_KEY || !process.env.BORRADO_EMAIL_FROM || !process.env.APP_BASE_URL) {
      console.error("[borrar-datos] Falta configurar RESEND_API_KEY, BORRADO_EMAIL_FROM o APP_BASE_URL.");
      return res.status(503).json({ error: "El servicio de verificación por email no está disponible temporalmente. Intentá más tarde." });
    }

    const usuarios = await supabaseFetch(`usuarios?email=eq.${encodeURIComponent(emailNormalizado)}&select=id,email&limit=1`);
    if (!usuarios.length) return res.status(200).json(respuestaGenerica);

    const titular = usuarios[0];
    const recientes = await supabaseFetch(`solicitudes_borrado?usuario_id=eq.${encodeURIComponent(titular.id)}&estado=eq.pendiente&creada_en=gte.${encodeURIComponent(new Date(Date.now() - 15 * 60 * 1000).toISOString())}&select=id&limit=1`);
    if (recientes.length) return res.status(200).json(respuestaGenerica);

    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiraEn = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    await supabaseFetch("solicitudes_borrado", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ usuario_id: titular.id, token_hash: tokenHash, estado: "pendiente", expira_en: expiraEn }),
    });

    const base = process.env.APP_BASE_URL.replace(/\/$/, "");
    const link = `${base}/api/confirmar-borrado?token=${encodeURIComponent(token)}`;
    try {
      await enviarEmailBorrado(emailNormalizado, link);
    } catch (mailError) {
      await supabaseFetch(`solicitudes_borrado?token_hash=eq.${tokenHash}&estado=eq.pendiente`, {
        method: "PATCH", body: JSON.stringify({ estado: "cancelada" }),
      }).catch(() => {});
      console.error("[borrar-datos] No se pudo enviar email de verificación:", mailError);
      return res.status(503).json({ error: "El servicio de verificación por email no está disponible temporalmente. Intentá más tarde." });
    }
    await emitirEvento({ usuarioId: titular.id, eventType: "borrado_datos_solicitado", sourceComponent: "borrar-datos", requestingComponent: "borrar-datos", payload: { metodo: "email" } });
    return res.status(200).json(respuestaGenerica);
  } catch (error) {
    console.error("Error al solicitar el borrado:", error);
    return res.status(500).json({ error: "Error interno al procesar la solicitud." });
  }
}
