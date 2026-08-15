// api/premium-admin.js
// Fase 8 (10/08/2026) — Panel admin mínimo. Bloqueado server-side contra ADMIN_USER_ID
// (variable de entorno en Vercel, decisión del Fundador: usar su propio usuario_id de
// sesión en vez de una contraseña separada — más simple, y nadie puede compartir/filtrar
// una clave suelta porque no existe tal clave).
//
// GET  = lista solicitudes pendientes.
// POST = aprueba o rechaza una solicitud puntual.

import { usuarioIdDesdeRequest } from "./_sesion.js";
import { supabaseFetch, SUPABASE_URL, SUPABASE_KEY } from "./_supabase.js";

const ADMIN_USER_ID = process.env.ADMIN_USER_ID;
const DIAS_PREMIUM = 30;

export default async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: "Falta configurar SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY." });
  }
  if (!ADMIN_USER_ID) {
    return res.status(500).json({ error: "Falta configurar ADMIN_USER_ID en Vercel." });
  }

  const usuarioId = usuarioIdDesdeRequest(req);
  if (!usuarioId || usuarioId !== ADMIN_USER_ID) {
    // Deliberadamente el mismo error genérico para "no logueado" y "logueado pero no admin"
    // — no le damos pistas a nadie de que existe una cuenta admin especial.
    return res.status(401).json({ error: "No autorizado." });
  }

  if (req.method === "GET") {
    try {
      const pendientes = await supabaseFetch(
        `premium_subscriptions?estado=eq.pendiente&select=id,user_id,metodo,monto,comprobante_url,created_at,usuarios(email,nombre_alias)&order=created_at.asc`
      );

      // Fase 8b (10/08/2026) — link temporal firmado para cada comprobante (el bucket es
      // privado, no hay URL pública). Vence en 1 hora, se genera fresco cada vez que se
      // carga la lista, nunca se guarda en la base.
      const conVistaPrevia = await Promise.all(
        pendientes.map(async (s) => {
          if (!s.comprobante_url) return { ...s, comprobanteSignedUrl: null };
          try {
            const resp = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/comprobantes-premium/${s.comprobante_url}`, {
              method: "POST",
              headers: { Authorization: `Bearer ${SUPABASE_KEY}`, apikey: SUPABASE_KEY, "Content-Type": "application/json" },
              body: JSON.stringify({ expiresIn: 3600 }),
            });
            if (!resp.ok) return { ...s, comprobanteSignedUrl: null };
            const data = await resp.json();
            return { ...s, comprobanteSignedUrl: data.signedURL ? `${SUPABASE_URL}/storage/v1${data.signedURL}` : null };
          } catch (err) {
            return { ...s, comprobanteSignedUrl: null };
          }
        })
      );

      return res.status(200).json({ pendientes: conVistaPrevia });
    } catch (err) {
      return res.status(500).json({ error: "Error listando pendientes.", detail: String(err) });
    }
  }

  if (req.method === "POST") {
    const { solicitudId, accion } = req.body || {};
    if (!solicitudId || !["aprobar", "rechazar"].includes(accion)) {
      return res.status(400).json({ error: "Faltan solicitudId y accion ('aprobar' | 'rechazar')." });
    }
    try {
      const filas = await supabaseFetch(`premium_subscriptions?id=eq.${solicitudId}&select=id,user_id,estado`);
      if (!filas.length) return res.status(404).json({ error: "Solicitud no encontrada." });
      if (filas[0].estado !== "pendiente") return res.status(409).json({ error: "Esta solicitud ya fue procesada." });

      const nuevoEstado = accion === "aprobar" ? "aprobado" : "rechazado";
      await supabaseFetch(`premium_subscriptions?id=eq.${solicitudId}`, {
        method: "PATCH",
        body: JSON.stringify({ estado: nuevoEstado }),
      });

      if (accion === "aprobar") {
        const premiumUntil = new Date(Date.now() + DIAS_PREMIUM * 24 * 60 * 60 * 1000).toISOString();
        await supabaseFetch(`usuarios?id=eq.${filas[0].user_id}`, {
          method: "PATCH",
          body: JSON.stringify({ nivel_acceso: "Premium", premium_until: premiumUntil }),
        });
      }

      return res.status(200).json({ ok: true, estado: nuevoEstado });
    } catch (err) {
      return res.status(500).json({ error: "Error procesando la solicitud.", detail: String(err) });
    }
  }

  return res.status(405).json({ error: "Método no permitido, usar GET o POST." });
}
// END: /api/premium-admin.js
