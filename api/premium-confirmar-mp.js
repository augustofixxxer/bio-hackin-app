// api/premium-confirmar-mp.js
// Fase 8 (10/08/2026) — Opción "Mercado Pago" del cobro mixto Premium (Checkout Pro, sin
// webhook todavía). El frontend llega acá desde la back_url de éxito de MP con un
// payment_id en la URL. Ese dato NUNCA se confía tal cual (cualquiera podría escribir
// cualquier payment_id a mano) — el backend siempre pregunta a la API real de Mercado
// Pago si ese pago existe, está aprobado, y por cuánto, antes de tocar la base.
//
// Riesgo aceptado y documentado (Marketing, 10/08/2026): si el usuario paga y cierra la
// pestaña antes de volver acá, el pago queda cobrado pero sin activar solo. Mitigación
// v1: Augusto lo ve en su panel de Mercado Pago y lo aprueba manual desde /admin/premium
// con el mp_payment_id. El webhook real queda para cuando haya más volumen (Fase 2).

import { usuarioIdDesdeRequest } from "./_sesion.js";
import { supabaseFetch, SUPABASE_URL, SUPABASE_KEY } from "./_supabase.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTO_MINIMO_MP = 13990;
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const DIAS_PREMIUM = 30;

export default async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: "Falta configurar SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY." });
  }
  if (!MP_ACCESS_TOKEN) {
    return res.status(500).json({ error: "Falta configurar MP_ACCESS_TOKEN en Vercel." });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido, usar POST." });
  }

  const usuarioId = usuarioIdDesdeRequest(req);
  if (!usuarioId) return res.status(401).json({ error: "Sesión inválida o vencida. Volvé a iniciar sesión." });
  if (!UUID_REGEX.test(usuarioId)) return res.status(400).json({ error: "usuarioId inválido." });

  const { paymentId } = req.body || {};
  if (!paymentId || !/^[0-9]+$/.test(String(paymentId))) {
    return res.status(400).json({ error: "Falta paymentId válido." });
  }

  // Si este pago ya fue procesado antes (usuario recarga la página de éxito, por ejemplo),
  // no lo volvemos a activar ni a duplicar en premium_subscriptions.
  try {
    const yaProcesado = await supabaseFetch(`premium_subscriptions?mp_payment_id=eq.${paymentId}&select=id,estado`);
    if (yaProcesado.length > 0) {
      return res.status(200).json({ ok: true, yaProcesado: true, estado: yaProcesado[0].estado });
    }
  } catch (err) {
    return res.status(500).json({ error: "Error verificando pagos previos.", detail: String(err) });
  }

  let pago;
  try {
    const resp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
    });
    if (!resp.ok) {
      return res.status(502).json({ error: "No se pudo verificar el pago contra Mercado Pago." });
    }
    pago = await resp.json();
  } catch (err) {
    return res.status(502).json({ error: "Error consultando la API de Mercado Pago.", detail: String(err) });
  }

  const aprobado = pago.status === "approved" && Number(pago.transaction_amount) >= MONTO_MINIMO_MP;

  try {
    await supabaseFetch(`premium_subscriptions`, {
      method: "POST",
      body: JSON.stringify({
        user_id: usuarioId,
        metodo: "mp",
        monto: pago.transaction_amount || 0,
        estado: aprobado ? "aprobado" : "rechazado",
        mp_payment_id: String(paymentId),
      }),
    });

    if (aprobado) {
      const premiumUntil = new Date(Date.now() + DIAS_PREMIUM * 24 * 60 * 60 * 1000).toISOString();
      await supabaseFetch(`usuarios?id=eq.${usuarioId}`, {
        method: "PATCH",
        body: JSON.stringify({ nivel_acceso: "Premium", premium_until: premiumUntil }),
      });
    }

    return res.status(200).json({ ok: aprobado, estadoPago: pago.status });
  } catch (err) {
    return res.status(500).json({ error: "Error registrando el pago.", detail: String(err) });
  }
}
// END: /api/premium-confirmar-mp.js
