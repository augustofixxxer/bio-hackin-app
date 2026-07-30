// api/_sesion.js
//
// Autenticación real de sesión (ST-01 — Identidad Confiable, implementación).
// Hasta este archivo, cada endpoint confiaba ciegamente en el "usuarioId" que
// mandaba el cliente en el body/query. Cualquiera que conociera (o adivinara)
// el usuarioId de otra persona podía leer o escribir sus datos. Este módulo
// cierra ese hueco: emite un "pase" firmado en el login, y cada endpoint
// protegido lo valida antes de confiar en QUIÉN dice ser el usuario.
//
// Mismo patrón same-folder que _supabase.js / _instrumentacion.js (Sprint 16:
// nunca separar en /lib, un require entre carpetas falla en producción acá).
// Usa el módulo "crypto" que ya viene con Node — cero dependencias nuevas,
// cero costo, cero riesgo de build.
//
// Formato del pase: "<usuarioId>.<expiraEnMs>.<firmaHex>"
// La firma es HMAC-SHA256 de "<usuarioId>.<expiraEnMs>" con SESSION_SECRET.
// Quien no tenga SESSION_SECRET no puede fabricar un pase válido.

import { createHmac, timingSafeEqual } from "crypto";

const SESSION_SECRET = process.env.SESSION_SECRET;
const DURACION_MS = 30 * 24 * 60 * 60 * 1000; // 30 días — evita pedir login seguido

function firmar(payload) {
  return createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
}

// Genera un pase nuevo para un usuarioId ya autenticado (llamar solo después
// de validar el login, ej. login-google.js tras confirmar el token de Google).
export function emitirPase(usuarioId) {
  if (!SESSION_SECRET) {
    throw new Error("Falta configurar SESSION_SECRET en Vercel (Projects tab).");
  }
  const expira = Date.now() + DURACION_MS;
  const payload = `${usuarioId}.${expira}`;
  const firma = firmar(payload);
  return `${payload}.${firma}`;
}

// Verifica un pase recibido. Devuelve el usuarioId si es válido y no expiró,
// o null si es inválido/expirado/ausente. Nunca lanza — el llamador decide
// qué responder (401) cuando devuelve null.
export function verificarPase(pase) {
  if (!SESSION_SECRET || !pase || typeof pase !== "string") return null;

  const partes = pase.split(".");
  if (partes.length !== 3) return null;
  const [usuarioId, expiraStr, firmaRecibida] = partes;

  const expira = Number(expiraStr);
  if (!usuarioId || !Number.isFinite(expira)) return null;
  if (Date.now() > expira) return null; // vencido

  const payload = `${usuarioId}.${expiraStr}`;
  const firmaEsperada = firmar(payload);

  // Comparación en tiempo constante — evita filtrar la firma correcta byte a
  // byte por diferencias de timing (buena práctica estándar al comparar HMACs).
  const bufRecibida = Buffer.from(firmaRecibida, "hex");
  const bufEsperada = Buffer.from(firmaEsperada, "hex");
  if (bufRecibida.length !== bufEsperada.length) return null;
  if (!timingSafeEqual(bufRecibida, bufEsperada)) return null;

  return usuarioId;
}

// Helper común para los endpoints: extrae el pase del header Authorization
// ("Bearer <pase>") o, como respaldo, de req.body/req.query.pase — y devuelve
// el usuarioId verificado o null. Centralizado acá para no repetir la lógica
// de extracción en cada uno de los 6 endpoints protegidos.
export function usuarioIdDesdeRequest(req) {
  const header = req.headers?.authorization || "";
  const pase = header.startsWith("Bearer ")
    ? header.slice(7)
    : (req.body?.pase || req.query?.pase);
  return verificarPase(pase);
}
// END: /api/_sesion.js
