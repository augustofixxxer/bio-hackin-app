// api/premium-activar-alias.js
// Fase 8 (10/08/2026) — Opción "Transferencia Alias" del cobro mixto Premium.
// Recibe el comprobante como base64 en el body (no multipart — evita instalar parsers
// nuevos, coherente con el stack zero-build). Sube el archivo a Supabase Storage (bucket
// privado "comprobantes-premium") y crea una fila "pendiente" en premium_subscriptions.
// NO activa Premium por sí solo — eso lo hace exclusivamente el panel admin.

import { usuarioIdDesdeRequest } from "./_sesion.js";
import { supabaseFetch, SUPABASE_URL, SUPABASE_KEY } from "./_supabase.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTO_ALIAS = 10000;
const MIME_PERMITIDOS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
const TAMANO_MAXIMO_BYTES = 8 * 1024 * 1024; // 8MB, generoso para una foto de comprobante

export default async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: "Falta configurar SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY." });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido, usar POST." });
  }

  const usuarioId = usuarioIdDesdeRequest(req);
  if (!usuarioId) return res.status(401).json({ error: "Sesión inválida o vencida. Volvé a iniciar sesión." });
  if (!UUID_REGEX.test(usuarioId)) return res.status(400).json({ error: "usuarioId inválido." });

  const { archivoBase64, mimeType } = req.body || {};
  if (!archivoBase64 || typeof archivoBase64 !== "string") {
    return res.status(400).json({ error: "Falta el comprobante (archivoBase64)." });
  }
  const extension = MIME_PERMITIDOS[mimeType];
  if (!extension) {
    return res.status(400).json({ error: "Formato no permitido. Usá JPG, PNG, WEBP o PDF." });
  }

  let buffer;
  try {
    buffer = Buffer.from(archivoBase64, "base64");
  } catch (err) {
    return res.status(400).json({ error: "El archivo recibido no es un base64 válido." });
  }
  if (buffer.length === 0 || buffer.length > TAMANO_MAXIMO_BYTES) {
    return res.status(400).json({ error: "El archivo está vacío o supera los 8MB permitidos." });
  }

  // Ya existe un pendiente para este usuario evita duplicados por doble click.
  try {
    const existentes = await supabaseFetch(`premium_subscriptions?user_id=eq.${usuarioId}&estado=eq.pendiente&select=id`);
    if (existentes.length > 0) {
      return res.status(409).json({ error: "Ya tenés un comprobante pendiente de revisión." });
    }
  } catch (err) {
    return res.status(500).json({ error: "Error verificando pendientes previos.", detail: String(err) });
  }

  const rutaArchivo = `${usuarioId}/${Date.now()}.${extension}`;

  try {
    const subida = await fetch(`${SUPABASE_URL}/storage/v1/object/comprobantes-premium/${rutaArchivo}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_KEY}`,
        apikey: SUPABASE_KEY,
        "Content-Type": mimeType,
      },
      body: buffer,
    });
    if (!subida.ok) {
      const detalle = await subida.text();
      return res.status(502).json({ error: "No se pudo subir el comprobante a almacenamiento.", detail: detalle });
    }

    const fila = await supabaseFetch(`premium_subscriptions`, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        user_id: usuarioId,
        metodo: "alias",
        monto: MONTO_ALIAS,
        comprobante_url: rutaArchivo,
        estado: "pendiente",
      }),
    });

    return res.status(200).json({ ok: true, solicitud: fila[0] });
  } catch (err) {
    return res.status(500).json({ error: "Error guardando la solicitud.", detail: String(err) });
  }
}
// END: /api/premium-activar-alias.js
