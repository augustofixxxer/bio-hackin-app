// api/premium.js
// Consolidación de deploy (19/08/2026) — Vercel Hobby tiene un límite de 12 funciones
// serverless por deployment. El proyecto llegó a 18 (sin que nadie lo notara, porque
// cada subida a GitHub "parecía" exitosa) y toda publicación falló en silencio desde
// hace ~11 días. Este archivo fusiona 5 endpoints Premium que antes eran 5 archivos
// separados — CERO cambio de lógica, cada handler es exactamente el mismo código que
// tenía su archivo propio, solo movidos bajo un router por query param (?ruta=).
//
// Mismo patrón same-folder de siempre (Sprint 16: nunca separar en /lib).
//
// Rutas:
//   POST /api/premium?ruta=activar-alias      (antes: premium-activar-alias.js)
//   GET  /api/premium?ruta=admin              (antes: premium-admin.js)
//   POST /api/premium?ruta=admin              (antes: premium-admin.js)
//   POST /api/premium?ruta=confirmar-mp       (antes: premium-confirmar-mp.js)
//   POST /api/premium?ruta=crear-preferencia  (antes: premium-crear-preferencia.js)
//   POST /api/premium?ruta=lista-espera       (antes: lista-espera-premium.js)

import { usuarioIdDesdeRequest } from "./_sesion.js";
import { supabaseFetch, SUPABASE_URL, SUPABASE_KEY } from "./_supabase.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID;
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const DIAS_PREMIUM = 30;
const MONTO_ALIAS = 10000;
const MONTO_MINIMO_MP = 13990;
const PRECIO_MP = 13990;
const MIME_PERMITIDOS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
const TAMANO_MAXIMO_BYTES = 8 * 1024 * 1024;

function emailValido(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// ===== ruta=activar-alias (idéntico a premium-activar-alias.js) =====
async function rutaActivarAlias(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido, usar POST." });

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
      headers: { Authorization: `Bearer ${SUPABASE_KEY}`, apikey: SUPABASE_KEY, "Content-Type": mimeType },
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
        user_id: usuarioId, metodo: "alias", monto: MONTO_ALIAS,
        comprobante_url: rutaArchivo, estado: "pendiente",
      }),
    });

    return res.status(200).json({ ok: true, solicitud: fila[0] });
  } catch (err) {
    return res.status(500).json({ error: "Error guardando la solicitud.", detail: String(err) });
  }
}

// ===== ruta=admin (idéntico a premium-admin.js) =====
async function rutaAdmin(req, res) {
  if (!ADMIN_USER_ID) return res.status(500).json({ error: "Falta configurar ADMIN_USER_ID en Vercel." });

  const usuarioId = usuarioIdDesdeRequest(req);
  if (!usuarioId || usuarioId !== ADMIN_USER_ID) {
    return res.status(401).json({ error: "No autorizado." });
  }

  if (req.method === "GET") {
    try {
      const pendientes = await supabaseFetch(
        `premium_subscriptions?estado=eq.pendiente&select=id,user_id,metodo,monto,comprobante_url,created_at,usuarios(email,nombre_alias)&order=created_at.asc`
      );
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

// ===== ruta=confirmar-mp (idéntico a premium-confirmar-mp.js) =====
async function rutaConfirmarMP(req, res) {
  if (!MP_ACCESS_TOKEN) return res.status(500).json({ error: "Falta configurar MP_ACCESS_TOKEN en Vercel." });
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido, usar POST." });

  const usuarioId = usuarioIdDesdeRequest(req);
  if (!usuarioId) return res.status(401).json({ error: "Sesión inválida o vencida. Volvé a iniciar sesión." });
  if (!UUID_REGEX.test(usuarioId)) return res.status(400).json({ error: "usuarioId inválido." });

  const { paymentId } = req.body || {};
  if (!paymentId || !/^[0-9]+$/.test(String(paymentId))) {
    return res.status(400).json({ error: "Falta paymentId válido." });
  }

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
    if (!resp.ok) return res.status(502).json({ error: "No se pudo verificar el pago contra Mercado Pago." });
    pago = await resp.json();
  } catch (err) {
    return res.status(502).json({ error: "Error consultando la API de Mercado Pago.", detail: String(err) });
  }

  const aprobado = pago.status === "approved" && Number(pago.transaction_amount) >= MONTO_MINIMO_MP;

  try {
    await supabaseFetch(`premium_subscriptions`, {
      method: "POST",
      body: JSON.stringify({
        user_id: usuarioId, metodo: "mp", monto: pago.transaction_amount || 0,
        estado: aprobado ? "aprobado" : "rechazado", mp_payment_id: String(paymentId),
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

// ===== ruta=crear-preferencia (idéntico a premium-crear-preferencia.js) =====
async function rutaCrearPreferencia(req, res) {
  if (!MP_ACCESS_TOKEN) return res.status(500).json({ error: "Falta configurar MP_ACCESS_TOKEN en Vercel." });
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido, usar POST." });

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

// ===== ruta=lista-espera (idéntico a lista-espera-premium.js) =====
async function rutaListaEspera(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido, usar POST." });

  const usuarioId = usuarioIdDesdeRequest(req);
  if (!usuarioId) return res.status(401).json({ error: "Sesión inválida o vencida. Volvé a iniciar sesión." });

  const { email } = req.body || {};
  if (!emailValido(email)) return res.status(400).json({ error: "Ingresá un email válido." });

  try {
    await supabaseFetch(`lista_espera_premium`, {
      method: "POST",
      body: JSON.stringify({ usuario_id: usuarioId, email: email.trim() }),
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Error en premium?ruta=lista-espera:", err);
    return res.status(500).json({ error: "Error guardando tu email", detail: String(err) });
  }
}

export default async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: "Falta configurar SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY." });
  }
  const ruta = req.query?.ruta;
  switch (ruta) {
    case "activar-alias": return rutaActivarAlias(req, res);
    case "admin": return rutaAdmin(req, res);
    case "confirmar-mp": return rutaConfirmarMP(req, res);
    case "crear-preferencia": return rutaCrearPreferencia(req, res);
    case "lista-espera": return rutaListaEspera(req, res);
    default: return res.status(400).json({ error: "Falta ?ruta= válida (activar-alias | admin | confirmar-mp | crear-preferencia | lista-espera)." });
  }
}
// END: /api/premium.js
