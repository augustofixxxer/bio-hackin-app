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

// Extrae el pase únicamente de Authorization o del body.
// Nunca se acepta en query string: las URL pueden quedar en logs e historial.
function extraerPase(req) {
  const header = req.headers?.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7);
  return req.body?.pase;
}

export function usuarioIdDesdeRequest(req) {
  return verificarPase(extraerPase(req));
}

// Diagnóstico seguro para logs: devuelve solo la causa probable, nunca el pase,
// la firma ni el identificador del usuario.
export function diagnosticarPaseRequest(req) {
  if (!SESSION_SECRET) return "session_secret_ausente";
  const pase = extraerPase(req);
  if (!pase || typeof pase !== "string") return "pase_ausente";
  const partes = pase.split(".");
  if (partes.length !== 3) return "formato_pase_invalido";
  const [usuarioId, expiraStr, firmaRecibida] = partes;
  const expira = Number(expiraStr);
  if (!usuarioId || !Number.isFinite(expira)) return "payload_pase_invalido";
  if (Date.now() > expira) return "pase_expirado";
  const firmaEsperada = firmar(`${usuarioId}.${expiraStr}`);
  const recibida = Buffer.from(firmaRecibida, "hex");
  const esperada = Buffer.from(firmaEsperada, "hex");
  if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) {
    return "firma_pase_invalida";
  }
  return "pase_valido";
}
// END: /api/_sesion.js
