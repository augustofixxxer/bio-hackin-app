// api/borrar-datos.js
// Derecho al olvido: recibe un email por POST y elimina de forma permanente
// al usuario en Supabase. Gracias a las relaciones ON DELETE CASCADE del esquema,
// borrar la fila de "usuarios" arrastra automáticamente:
// - Todos sus registros en "registro_diario_real"
// - Todos los "bloqueos" vinculados a esos registros
// - Todos sus registros en "bienestar_diario_real"
// - Todos sus registros en "insights_generados"
//
// A PROPÓSITO NO se borran "log_aceptacion_terminos" ni "log_consentimiento_riesgo":
// son la prueba de que la app cumplió con el blindaje legal (Compliance by Design).
// No tienen ninguna relación (foreign key) hacia el usuario, así que el CASCADE
// nunca los toca. No contienen datos de comida/bienestar, solo evidencia de que
// se aceptaron términos o se confirmó un riesgo, con fecha e IP. Decisión
// confirmada explícitamente por el dueño del producto.
//
// SIEMPRE responde con el mismo mensaje genérico, exista o no el email,
// para no revelar si un email está registrado (buena práctica de privacidad).

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Falta configurar SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.' });
  }

  const { email } = req.body || {};
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Falta un email válido' });
  }

  const respuestaGenerica = {
    ok: true,
    mensaje: 'Si el email está registrado, tus datos fueron eliminados de forma permanente.',
  };

  try {
    // 1. Buscar el usuario por email
    const encontrados = await supabaseFetch(
      `usuarios?email=eq.${encodeURIComponent(email)}&select=id`
    );

    if (!encontrados || encontrados.length === 0) {
      return res.status(200).json(respuestaGenerica);
    }

    const usuarioId = encontrados[0].id;

    // 2. Un solo DELETE: el ON DELETE CASCADE del esquema se encarga de arrastrar
    // registro_diario_real, bloqueos, bienestar_diario_real e insights_generados.
    // Los dos logs de cumplimiento no tienen FK hacia usuarios, así que quedan intactos.
    await supabaseFetch(`usuarios?id=eq.${usuarioId}`, { method: 'DELETE' });

    return res.status(200).json(respuestaGenerica);
  } catch (error) {
    console.error('Error al borrar datos:', error);
    return res.status(500).json({ error: 'Error interno al procesar la solicitud' });
  }
}
