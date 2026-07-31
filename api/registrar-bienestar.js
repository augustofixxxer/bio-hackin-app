// api/registrar-bienestar.js
// Recibe POST con { pase, energia?, digestion?, sueno?, hidratacion?, actividad_fisica? }
// y crea un registro en "bienestar_diario_real".
//
// REDISEÑO 30/07/2026 (definido con Augusto): el registro deja de ser "las 4 cosas juntas
// o nada" — cada campo es independiente y opcional. El usuario carga lo que quiere, cuando
// quiere; no es un formulario obligatorio (eso traicionaría la autonomía que buscamos, ver
// Constitución). Se exige al menos UN campo, para no crear filas completamente vacías.
//
// También cambia qué se mide: "animo" sale (se contamina con factores no alimenticios,
// ej. una discusión de pareja). "sueno" pasa de escala subjetiva 1-5 a horas reales en
// rangos con base científica. Se suman "hidratacion" y "actividad_fisica", ambos con
// rangos basados en guías científicas (ver comentarios de columna en Supabase para las
// fuentes exactas — CDC/AASM para sueño, Instituto de Medicina para hidratación, OMS para
// actividad física).
//
// AUTENTICACIÓN REAL DE SESIÓN (29/07/2026): el usuarioId se extrae del "pase" firmado
// (ver _sesion.js). Si el pase no es válido, 401.

import { usuarioIdDesdeRequest } from "./_sesion.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function supabaseFetch(path, options = {}) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await resp.text();
  const data = text ? JSON.parse(text) : null;
  if (!resp.ok) {
    throw new Error((data && (data.message || data.error)) || `Supabase respondió ${resp.status}`);
  }
  return data;
}

function validarEscala(valor) {
  return ["1", "2", "3", "4", "5"].includes(String(valor));
}

const SUENO_VALIDOS = ["menos_6h", "6_7h", "7_9h", "mas_9h"];
const HIDRATACION_VALIDOS = ["menos_1l", "1_2l", "2_3l", "mas_3l"];
const ACTIVIDAD_VALIDOS = ["sedentario", "activo", "muy_activo"];

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

  const usuarioId = usuarioIdDesdeRequest(req);
  if (!usuarioId) {
    return res.status(401).json({ error: "Sesión inválida o vencida. Volvé a iniciar sesión." });
  }

  const { energia, digestion, sueno, hidratacion, actividad_fisica } = req.body || {};

  const registro = {};

  if (energia !== undefined && energia !== null && energia !== "") {
    if (!validarEscala(energia)) {
      return res.status(400).json({ error: 'El valor de "energia" debe ser un número del 1 al 5.' });
    }
    registro.energia = Number(energia);
  }
  if (digestion !== undefined && digestion !== null && digestion !== "") {
    if (!validarEscala(digestion)) {
      return res.status(400).json({ error: 'El valor de "digestion" debe ser un número del 1 al 5.' });
    }
    registro.digestion = Number(digestion);
  }
  if (sueno !== undefined && sueno !== null && sueno !== "") {
    if (!SUENO_VALIDOS.includes(sueno)) {
      return res.status(400).json({ error: "Valor de sueño inválido." });
    }
    registro.sueno = sueno;
  }
  if (hidratacion !== undefined && hidratacion !== null && hidratacion !== "") {
    if (!HIDRATACION_VALIDOS.includes(hidratacion)) {
      return res.status(400).json({ error: "Valor de hidratación inválido." });
    }
    registro.hidratacion = hidratacion;
  }
  if (actividad_fisica !== undefined && actividad_fisica !== null && actividad_fisica !== "") {
    if (!ACTIVIDAD_VALIDOS.includes(actividad_fisica)) {
      return res.status(400).json({ error: "Valor de actividad física inválido." });
    }
    registro.actividad_fisica = actividad_fisica;
  }

  if (Object.keys(registro).length === 0) {
    return res.status(400).json({ error: "Cargá al menos un dato (energía, digestión, sueño, hidratación o actividad física)." });
  }

  try {
    const acceso = await verificarAcceso(usuarioId);
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
        ...registro,
      }),
    });

    return res.status(200).json({ ok: true, id: creado[0].id });
  } catch (err) {
    console.error("Error en registrar-bienestar:", err);
    return res.status(500).json({ error: "Error procesando el registro de bienestar", detail: String(err) });
  }
}
// END: /api/registrar-bienestar.js
