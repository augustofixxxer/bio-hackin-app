// api/generar-insights.js
// Capa de acceso/presentación: valida la cuenta y el nivel de acceso del usuario,
// y decide qué experiencia corresponde mostrar. El cálculo real del insight
// vive aparte, en lib/motor-insights.js, que no conoce nada de esto.

const { calcularInsights } = require('../lib/motor-insights');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const MUESTRA_GENERICA = {
  bloqueo: 'Milanesa + Papas Fritas (ejemplo)',
  metrica: 'Energía',
  frase: 'Los días después de "Milanesa + Papas Fritas", tu energía bajó en promedio 1.2 puntos comparado a tus días habituales. Este es un ejemplo — suscribite para ver tus propios patrones reales.',
};

async function supabaseFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error((data && (data.message || data.error)) || `Supabase error ${res.status}`);
  }
  return data;
}

module.exports = async (req, res) => {
  try {
    const usuarioId = req.query?.usuarioId || req.body?.usuarioId;
    if (!usuarioId) {
      return res.status(400).json({ error: 'Falta usuarioId' });
    }
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return res.status(500).json({ error: 'Falta configurar SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Vercel' });
    }

    // Validación de cuenta y nivel de acceso — vive acá, no en el motor.
    const usuarioRows = await supabaseFetch(
      `usuarios?id=eq.${usuarioId}&select=cuenta_suspendida,terminos_aceptados,nivel_acceso`
    );
    if (!usuarioRows.length) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    const usuario = usuarioRows[0];

    if (usuario.cuenta_suspendida === true) {
      return res.status(403).json({ error: 'Esta cuenta fue suspendida. Contactanos si creés que es un error.' });
    }
    if (usuario.terminos_aceptados !== true) {
      return res.status(403).json({ error: 'Debés aceptar los Términos y Condiciones para continuar.', requiereTerminos: true });
    }

    const esPremium = usuario.nivel_acceso === 'Premium' || usuario.nivel_acceso === 'Personalizado';

    if (!esPremium) {
      // El motor nunca se ejecuta para un usuario no-Premium: la restricción
      // comercial se resuelve acá, antes de tocar el cálculo real.
      return res.status(200).json({
        estado: 'bloqueado',
        muestra: MUESTRA_GENERICA,
      });
    }

    // Usuario Premium: el motor puro calcula, sin saber que esta validación existió.
    const resultado = await calcularInsights(usuarioId);
    return res.status(200).json(resultado);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error generando insights', detalle: err.message });
  }
};
