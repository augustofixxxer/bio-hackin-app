// api/borrar-datos.js
// Derecho al olvido: exige sesión válida y confirmación del email por POST.
// Solo elimina la cuenta autenticada; nunca permite borrar a otra persona por email. Gracias a las relaciones ON DELETE CASCADE del esquema,
// borrar la fila de "usuarios" arrastra automáticamente:
// - Todos sus registros en "registro_diario_real"
// - Todos los "bloqueos" vinculados a esos registros
// - Todos sus registros en "bienestar_diario_real"
// - Todos sus registros en "insights_generados"
// - Todos sus registros en "reacciones_alternativas" (Fase 2, 10/08/2026 — tabla creada
//   ya con FK ON DELETE CASCADE hacia usuarios, no requirió tocar este archivo)
//
// A PROPÓSITO NO se borran "log_aceptacion_terminos" ni "log_consentimiento_riesgo":
// son la prueba de que la app cumplió con el blindaje legal (Compliance by Design).
// No tienen ninguna relación (foreign key) hacia el usuario, así que el CASCADE
// nunca los toca. No contienen datos de comida/bienestar, solo evidencia de que
// se aceptaron términos o se confirmó un riesgo, con fecha e IP. Decisión
// confirmada explícitamente por el dueño del producto.
//
// La confirmación por email evita borrados accidentales; la sesión determina la identidad.

// MIS Etapa 2 — Integración de Trazabilidad. No intrusivo: emitirEvento nunca lanza,
// un fallo interno se loguea y se descarta (mismo patrón que registrar-comida.js).
// Se emite ANTES del DELETE a propósito: el usuario_id todavía tiene que existir
// en la tabla "usuarios" en ese instante, porque usuario_subject_map tiene FK hacia
// usuarios.id. El registro histórico (Sujeto/Acción/REA/Evento) no depende de esa FK
// y sobrevive al borrado en cascada, quedando como evidencia de que la solicitud
// de borrado se ejecutó.
import { emitirEvento } from "./_instrumentacion.js";
import { supabaseFetch, SUPABASE_URL, SUPABASE_KEY } from "./_supabase.js";
import { usuarioIdDesdeRequest } from "./_sesion.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: "Servicio no configurado." });
  }

  const usuarioId = usuarioIdDesdeRequest(req);
  if (!usuarioId) return res.status(401).json({ error: "Iniciá sesión para eliminar tu cuenta." });

  const { email } = req.body || {};
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return res.status(400).json({ error: "Escribí el email de tu cuenta para confirmar." });
  }

  try {
    const filas = await supabaseFetch(`usuarios?id=eq.${encodeURIComponent(usuarioId)}&select=id,email`);
    if (!filas || filas.length === 0) {
      return res.status(200).json({ ok: true, mensaje: "Tu cuenta ya no existe." });
    }
    if (String(filas[0].email || "").trim().toLowerCase() !== email.trim().toLowerCase()) {
      return res.status(400).json({ error: "El email no coincide con el de tu cuenta." });
    }

    // Evidencia ANTES del DELETE: usuario_subject_map exige que el usuario exista.
    await emitirEvento({
      usuarioId,
      eventType: "borrado_datos_solicitado",
      sourceComponent: "borrar-datos",
      requestingComponent: "borrar-datos",
      payload: {},
    });

    await supabaseFetch(`usuarios?id=eq.${encodeURIComponent(usuarioId)}`, { method: "DELETE" });
    return res.status(200).json({ ok: true, mensaje: "Tu cuenta y tus datos fueron eliminados de forma permanente." });
  } catch (error) {
    console.error("[borrar-datos] error procesando la eliminación:", error);
    return res.status(500).json({ error: "Error interno al procesar la solicitud." });
  }
}
// END: /api/borrar-datos.js
