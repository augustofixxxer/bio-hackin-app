// api/borrar-datos.js
// Derecho al olvido: solo permite borrar la cuenta autenticada por un pase firmado.
// El email es una confirmación adicional; nunca selecciona qué cuenta borrar.
// Se preservan los logs de cumplimiento aprobados por el responsable del producto.

import { emitirEvento } from "./_instrumentacion.js";
import { supabaseFetch, SUPABASE_URL, SUPABASE_KEY } from "./_supabase.js";
import { usuarioIdDesdeRequest } from "./_sesion.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: "Falta configurar Supabase." });
  }

  // El pase firmado es la única fuente autorizada de identidad.
  const usuarioId = usuarioIdDesdeRequest(req);
  if (!usuarioId) {
    return res.status(401).json({
      error: "Sesión inválida o vencida. Iniciá sesión en Reseteo Propio para confirmar el borrado.",
    });
  }

  const { email } = req.body || {};
  if (typeof email !== "string" || !email.trim().includes("@")) {
    return res.status(400).json({ error: "Ingresá el email de tu cuenta para confirmar el borrado." });
  }

  try {
    // Verifica el email contra la cuenta del pase. El cliente no puede elegir otra cuenta.
    const usuarios = await supabaseFetch(
      `usuarios?id=eq.${encodeURIComponent(usuarioId)}&select=id,email`
    );

    if (!usuarios || usuarios.length === 0) {
      return res.status(401).json({ error: "La sesión ya no corresponde a una cuenta activa." });
    }

    const emailCuenta = String(usuarios[0].email || "").trim().toLowerCase();
    if (email.trim().toLowerCase() !== emailCuenta) {
      return res.status(403).json({ error: "El email no coincide con la cuenta autenticada. No se borró ningún dato." });
    }

    // Debe ejecutarse antes del DELETE: usuario_subject_map tiene FK a usuarios.
    // emitirEvento es deliberadamente no bloqueante; registra el intento cuando puede.
    await emitirEvento({
      usuarioId,
      eventType: "borrado_datos_solicitado",
      sourceComponent: "borrar-datos",
      requestingComponent: "borrar-datos",
      payload: {},
    });

    // Borrado permanente SOLO del usuario autenticado; ON DELETE CASCADE gestiona sus datos.
    // Los logs de cumplimiento se preservan conforme a la decisión aprobada.
    await supabaseFetch(
      `usuarios?id=eq.${encodeURIComponent(usuarioId)}`,
      { method: "DELETE" }
    );

    return res.status(200).json({
      ok: true,
      mensaje: "La cuenta autenticada y sus datos asociados fueron eliminados de forma permanente.",
    });
  } catch (error) {
    console.error("Error al borrar datos:", error);
    return res.status(500).json({ error: "Error interno al procesar la solicitud." });
  }
}
// END: /api/borrar-datos.js
