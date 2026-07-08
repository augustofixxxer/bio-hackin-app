// api/borrar-datos.js
// Derecho al olvido: recibe un email por POST y elimina de forma permanente y en cascada:
// - El registro del usuario en "Usuarios Real"
// - Todos sus registros en "Registro Diario Real"
// - Todos los "Bloqueos" vinculados a esos registros
// - Todos sus registros en "Bienestar Diario Real"
// - Todos sus registros en "Insights Generados"
//
// A PROPÓSITO NO se borran "Log Aceptacion Terminos" ni "Log Consentimiento Riesgo":
// son la prueba de que la app cumplió con el blindaje legal (Compliance by Design).
// No contienen datos de comida/bienestar, solo evidencia de que se aceptaron términos
// o se confirmó un riesgo, con fecha e IP. Decisión confirmada explícitamente por el
// dueño del producto.
//
// SIEMPRE responde con el mismo mensaje genérico, exista o no el email,
// para no revelar si un email está registrado (buena práctica de privacidad).

const BASE_ID = 'appVzRFXuykP2ZBvR';

const TABLAS = {
  usuarios: 'tblJDf0WF5eCTWxLt',
  registro: 'tblHYg7bZCVvgiEOe',
  bloqueos: 'tblfYPLNnJDvStK3q',
  bienestar: 'tbldbb580xRTayNJT',
  insights: 'tblhoGZoBgy3Kq7kn',
};

const F_USUARIOS = { email: 'fldA1TM4B6yumsrEx' };
const F_REGISTRO = { usuario: 'fld3S0l46TCaGbEPy', bloqueosDetectados: 'fldUGfLDclHefFJjD' };
const F_BIENESTAR = { usuario: 'fldRUM2cHk1vHNrNw' };
const F_INSIGHTS = { usuario: 'fldVIDaXtAn2qDTWR' };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { email } = req.body || {};
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Falta un email válido' });
  }

  const headers = {
    Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json',
  };

  const respuestaGenerica = {
    ok: true,
    mensaje: 'Si el email está registrado, tus datos fueron eliminados de forma permanente.',
  };

  try {
    // 1. Buscar el usuario por email
    const formulaUsuario = encodeURIComponent(`{${F_USUARIOS.email}} = '${email.replace(/'/g, "\\'")}'`);
    const usuariosRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${TABLAS.usuarios}?filterByFormula=${formulaUsuario}`,
      { headers }
    );
    const usuariosData = await usuariosRes.json();

    if (!usuariosData.records || usuariosData.records.length === 0) {
      return res.status(200).json(respuestaGenerica);
    }

    const usuarioId = usuariosData.records[0].id;
    const formulaConCampo = (fieldId) => encodeURIComponent(`FIND('${usuarioId}', ARRAYJOIN({${fieldId}}))`);

    // 2. Buscar todos los registros diarios de comida vinculados a este usuario
    const registrosRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${TABLAS.registro}?filterByFormula=${formulaConCampo(F_REGISTRO.usuario)}`,
      { headers }
    );
    const registrosData = await registrosRes.json();
    const registros = registrosData.records || [];

    // 3. Recolectar los Bloqueos vinculados a esos registros
    let bloqueoIds = [];
    for (const registro of registros) {
      const vinculados = registro.fields[F_REGISTRO.bloqueosDetectados] || [];
      bloqueoIds = bloqueoIds.concat(vinculados);
    }

    // 4. Buscar registros de Bienestar Diario Real vinculados a este usuario
    const bienestarRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${TABLAS.bienestar}?filterByFormula=${formulaConCampo(F_BIENESTAR.usuario)}`,
      { headers }
    );
    const bienestarData = await bienestarRes.json();
    const bienestarIds = (bienestarData.records || []).map((r) => r.id);

    // 5. Buscar registros de Insights Generados vinculados a este usuario
    const insightsRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${TABLAS.insights}?filterByFormula=${formulaConCampo(F_INSIGHTS.usuario)}`,
      { headers }
    );
    const insightsData = await insightsRes.json();
    const insightsIds = (insightsData.records || []).map((r) => r.id);

    // 6. Borrar en cascada: primero lo dependiente, al final el Usuario.
    //    (Log Aceptacion Terminos y Log Consentimiento Riesgo NO se tocan, a propósito.)
    await borrarEnLotes(TABLAS.bloqueos, bloqueoIds, headers);
    await borrarEnLotes(TABLAS.registro, registros.map((r) => r.id), headers);
    await borrarEnLotes(TABLAS.bienestar, bienestarIds, headers);
    await borrarEnLotes(TABLAS.insights, insightsIds, headers);
    await borrarEnLotes(TABLAS.usuarios, [usuarioId], headers);

    return res.status(200).json(respuestaGenerica);
  } catch (error) {
    console.error('Error al borrar datos:', error);
    return res.status(500).json({ error: 'Error interno al procesar la solicitud' });
  }
}

// Airtable solo permite borrar hasta 10 registros por llamada
async function borrarEnLotes(tableId, ids, headers) {
  for (let i = 0; i < ids.length; i += 10) {
    const lote = ids.slice(i, i + 10);
    if (lote.length === 0) continue;
    const query = lote.map((id) => `records[]=${id}`).join('&');
    await fetch(`https://api.airtable.com/v0/${BASE_ID}/${tableId}?${query}`, {
      method: 'DELETE',
      headers,
    });
  }
}
