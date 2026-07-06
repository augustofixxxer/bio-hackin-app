// api/borrar-datos.js
// Recibe un email por POST y elimina de forma permanente:
// - El registro del usuario en "Usuarios Real"
// - Todos sus registros en "Registro Diario Real"
// - Todos los "Bloqueos" vinculados a esos registros
//
// SIEMPRE responde con el mismo mensaje genérico, exista o no el email,
// para no revelar si un email está registrado (buena práctica de privacidad).

const BASE_ID = 'appVzRFXuykP2ZBvR';
const TABLA_USUARIOS = 'tblJDf0WF5eCTWxLt';
const TABLA_REGISTRO_DIARIO = 'tblHYg7bZCVvgiEOe';
const TABLA_BLOQUEOS = 'tblfYPLNnJDvStK3q';

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
    const formulaUsuario = encodeURIComponent(`{Email} = '${email.replace(/'/g, "\\'")}'`);
    const usuariosRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${TABLA_USUARIOS}?filterByFormula=${formulaUsuario}`,
      { headers }
    );
    const usuariosData = await usuariosRes.json();

    if (!usuariosData.records || usuariosData.records.length === 0) {
      // No existe el email: igual respondemos genérico, sin error.
      return res.status(200).json(respuestaGenerica);
    }

    const usuarioId = usuariosData.records[0].id;

    // 2. Buscar todos los registros diarios vinculados a este usuario
    //    (asume que el campo de link se llama "Usuario" — verificar en Airtable)
    const formulaRegistros = encodeURIComponent(`FIND('${usuarioId}', ARRAYJOIN({Usuario}))`);
    const registrosRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${TABLA_REGISTRO_DIARIO}?filterByFormula=${formulaRegistros}`,
      { headers }
    );
    const registrosData = await registrosRes.json();
    const registros = registrosData.records || [];

    // 3. Recolectar los Bloqueos vinculados a esos registros
    //    (asume que el campo de link se llama "Bloqueos Detectados" — verificar en Airtable)
    let bloqueoIds = [];
    for (const registro of registros) {
      const vinculados = registro.fields['Bloqueos Detectados'] || [];
      bloqueoIds = bloqueoIds.concat(vinculados);
    }

    // 4. Borrar en orden: primero Bloqueos, después Registros, al final el Usuario
    await borrarEnLotes(TABLA_BLOQUEOS, bloqueoIds, headers);
    await borrarEnLotes(TABLA_REGISTRO_DIARIO, registros.map(r => r.id), headers);
    await borrarEnLotes(TABLA_USUARIOS, [usuarioId], headers);

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
    const query = lote.map(id => `records[]=${id}`).join('&');
    await fetch(`https://api.airtable.com/v0/${BASE_ID}/${tableId}?${query}`, {
      method: 'DELETE',
      headers,
    });
  }
}
