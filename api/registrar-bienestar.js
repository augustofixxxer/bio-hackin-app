// api/registrar-bienestar.js
// Recibe POST con { energia, animo, sueno, digestion, usuarioId } (1-5 cada uno)
// y crea un registro en la tabla "bienestar_diario_real", vinculado al usuario.

// MIS Etapa 2 — Integración de Trazabilidad. No intrusivo: emitirEvento nunca lanza,
// un fallo interno se loguea y se descarta (mismo patrón que registrar-comida.js).
import { emitirEvento, evaluarValidacionParalela } from "./_instrumentacion.js";
// BT-02 — conexión a Supabase unificada (ver api/_supabase.js).
import { supabaseFetch, SUPABASE_URL, SUPABASE_KEY } from "./_supabase.js";

// Sprint "Sanitización" — usuarioId se interpola en la query de verificarAcceso()
// más abajo, por eso debe validarse como UUID antes de llegar ahí.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function esUUIDValido(valor) {
  return typeof valor === "string" && UUID_REGEX.test(valor);
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
  if (!esUUIDValido(usuarioId)) {
    return res.status(400).json({ error: "usuarioId inválido." });
  }

  try {
    const acceso = await verificarAcceso(usuarioId);

    // MIS Etapa 3 — Validación Paralela. No cambia el resultado de "acceso": solo
    // deja evidencia de si el modelo nuevo (Sujeto→Capacidad→Concesión) hubiera
    // coincidido con esta decisión legacy. Nunca bloquea ni reemplaza nada.
    await evaluarValidacionParalela({
      usuarioId,
      capabilityName: "uso_basico_app",
      decisionLegacy: acceso.ok,
      sourceComponent: "registrar-bienestar",
    });

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

    await emitirEvento({
      usuarioId,
      eventType: "bienestar_registrado",
      sourceComponent: "registrar-bienestar",
      requestingComponent: "registrar-bienestar",
      payload: { id: creado[0].id },
    });

    return res.status(200).json({ ok: true, id: creado[0].id });
  } catch (err) {
    console.error("Error en registrar-bienestar:", err);
    return res.status(500).json({ error: "Error procesando el registro de bienestar", detail: String(err) });
  }
}
// END: /api/registrar-bienestar.js
