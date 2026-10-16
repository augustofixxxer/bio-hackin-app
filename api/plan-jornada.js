import { supabaseFetch, SUPABASE_URL, SUPABASE_KEY } from "./_supabase.js";
import { usuarioIdDesdeRequest } from "./_sesion.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function fechaArgentina() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type) => parts.find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function fechaValida(value) {
  if (typeof value !== "string" || !DATE_REGEX.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function respuestaPerfil(usuario) {
  const premium = usuario.cuenta_suspendida !== true &&
    usuario.nivel_acceso === "Premium" &&
    (!usuario.premium_until || Date.parse(usuario.premium_until) > Date.now());
  return {
    objetivoGrupo: usuario.objetivo_grupo || "salud_general",
    nivelAcceso: premium ? "Premium" : "gratuito",
    premium,
  };
}

function respuestaPlan(row, fecha) {
  return {
    fecha,
    tipo: row?.tipo === "entreno" ? "entreno" : "descanso",
    hora: row?.hora_sesion ? String(row.hora_sesion).slice(0, 5) : "07:00",
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Método no permitido." });
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: "Falta configurar Supabase en el servidor." });
  }

  const usuarioId = usuarioIdDesdeRequest(req);
  if (!usuarioId || !UUID_REGEX.test(usuarioId)) {
    return res.status(401).json({ error: "Sesión inválida o vencida. Volvé a iniciar sesión." });
  }

  try {
    const usuarios = await supabaseFetch(
      `usuarios?id=eq.${encodeURIComponent(usuarioId)}&select=id,objetivo_grupo,nivel_acceso,premium_until,cuenta_suspendida,terminos_aceptados`
    );
    const usuario = usuarios?.[0];
    if (!usuario) return res.status(404).json({ error: "Usuario no encontrado." });
    if (usuario.cuenta_suspendida === true) {
      return res.status(403).json({ error: "La cuenta está suspendida." });
    }
    if (usuario.terminos_aceptados !== true) {
      return res.status(403).json({ error: "Debés aceptar los Términos y Condiciones para continuar." });
    }

    const perfil = respuestaPerfil(usuario);

    if (req.method === "GET") {
      const fechaSolicitada = req.query?.fecha;
      const fecha = fechaValida(fechaSolicitada) ? fechaSolicitada : fechaArgentina();
      const rows = await supabaseFetch(
        `plan_jornada_diaria?usuario_id=eq.${encodeURIComponent(usuarioId)}&fecha=eq.${encodeURIComponent(fecha)}&select=fecha,tipo,hora_sesion&limit=1`
      );
      return res.status(200).json({ perfil, plan: respuestaPlan(rows?.[0], fecha) });
    }

    const { fecha, tipo, hora } = req.body || {};
    if (!fechaValida(fecha)) return res.status(400).json({ error: "La fecha enviada no es válida." });
    if (tipo !== "entreno" && tipo !== "descanso") {
      return res.status(400).json({ error: "El tipo de jornada debe ser entreno o descanso." });
    }
    if (tipo === "entreno" && !TIME_REGEX.test(String(hora || ""))) {
      return res.status(400).json({ error: "Indicá una hora válida para la sesión." });
    }

    const row = {
      usuario_id: usuarioId,
      fecha,
      tipo,
      hora_sesion: tipo === "entreno" ? hora : null,
      updated_at: new Date().toISOString(),
    };
    const saved = await supabaseFetch("plan_jornada_diaria?on_conflict=usuario_id,fecha", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(row),
    });
    return res.status(200).json({ ok: true, perfil, plan: respuestaPlan(saved?.[0] || row, fecha) });
  } catch (error) {
    // No exponer detalles internos ni credenciales en el mensaje de respuesta.
    return res.status(500).json({ error: "No pudimos leer o guardar tu jornada. Verificá que la migración plan_jornada_diaria esté aplicada." });
  }
}
