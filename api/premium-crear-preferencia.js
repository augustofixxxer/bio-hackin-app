// api/premium-crear-preferencia.js
// Fase 8 (10/08/2026) — Crea la "preferencia" de pago en Mercado Pago (Checkout Pro) y
// devuelve la URL a la que el frontend tiene que redirigir al usuario. Pieza que faltaba
// en la propuesta original: sin esto, el botón "Pagar con Mercado Pago" no tiene a dónde
// llevar al usuario.

import { usuarioIdDesdeRequest } from "./_sesion.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const PRECIO_MP = 13990;

export default async function handler(req, res) {
  if (!MP_ACCESS_TOKEN) {
    return res.status(500).json({ error: "Falta configurar MP_ACCESS_TOKEN en Vercel." });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido, usar POST." });
  }

  const usuarioId = usuarioIdDesdeRequest(req);
  if (!usuarioId) return res.status(401).json({ error: "Sesión inválida o vencida. Volvé a iniciar sesión." });
  if (!UUID_REGEX.test(usuarioId)) return res.status(400).json({ error: "usuarioId inválido." });

  const origen = req.headers.origin || `https://${req.headers.host}`;

  try {
    const resp = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ title: "Reseteo Propio Premium (30 días)", quantity: 1, currency_id: "ARS", unit_price: PRECIO_MP }],
        back_urls: {
          success: `${origen}/?premium_mp_status=success`,
          failure: `${origen}/?premium_mp_status=failure`,
          pending: `${origen}/?premium_mp_status=pending`,
        },
        auto_return: "approved",
        external_reference: usuarioId,
      }),
    });
    if (!resp.ok) {
      const detalle = await resp.text();
      return res.status(502).json({ error: "Mercado Pago rechazó la creación de la preferencia.", detail: detalle });
    }
    const data = await resp.json();
    return res.status(200).json({ initPoint: data.init_point });
  } catch (err) {
    return res.status(502).json({ error: "Error creando la preferencia de pago.", detail: String(err) });
  }
}
// END: /api/premium-crear-preferencia.js
