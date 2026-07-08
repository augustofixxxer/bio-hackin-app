// api/registrar-bienestar.js
// Recibe POST con { energia, animo, sueno, digestion, usuarioId } (1-5 cada uno)
// y crea un registro en la tabla "Bienestar Diario Real", vinculado al usuario.

const BASE_ID = "appVzRFXuykP2ZBvR";
const TABLA_BIENESTAR = "tbldbb580xRTayNJT";

const F_BIENESTAR = {
  fecha: "fldcZa7HAYVLD2dGU",
  usuario: "fldRUM2cHk1vHNrNw",
  energia: "fldqHkAaafjlYUoIu",
  animo: "fldv6YpDiCRqsDd0X",
  sueno: "fldG5sTb34bJCMtcb",
  digestion: "fldvdAffD3stkIf2p",
};

function validarEscala(valor) {
  return ["1", "2", "3", "4", "5"].includes(String(valor));
}

// Blindaje legal: bloquea el uso si no aceptó Términos, o si la cuenta fue suspendida.
const TABLA_USUARIOS = "tblJDf0WF5eCTWxLt";
const F_USUARIOS_ACCESO = { terminosAceptados: "fld2IGCUNz35rdAhh", suspendida: "fldZsandK60e6CpYB" };
async function verificarAcceso(usuarioId, apiKey) {
  const resp = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLA_USUARIOS}/${usuarioId}?returnFieldsByFieldId=true`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!resp.ok) return { ok: false, status: 404, error: "Usuario no encontrado." };
  const data = await resp.json();
  const f = data.fields || {};
  if (f[F_USUARIOS_ACCESO.suspendida] === true) {
    return { ok: false, status: 403, error: "Esta cuenta fue suspendida. Contactanos si creés que es un error." };
  }
  if (f[F_USUARIOS_ACCESO.terminosAceptados] !== true) {
    return { ok: false, status: 403, error: "Debés aceptar los Términos y Condiciones para continuar.", requiereTerminos: true };
  }
  return { ok: true };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido, usar POST." });
  }

  const apiKey = process.env.AIRTABLE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Falta configurar AIRTABLE_API_KEY." });
  }

  const { energia, animo, sueno, digestion, usuarioId } = req.body || {};

  for (const [nombre, valor] of Object.entries({ energia, animo, sueno, digestion })) {
    if (!validarEscala(valor)) {
      return res.status(400).json({ error: `El valor de "${nombre}" debe ser un número del 1 al 5.` });
    }
  }
  if (!usuarioId || typeof usuarioId !== "string") {
    return res.status(400).json({ error: "Falta el usuarioId." });
  }

  const acceso = await verificarAcceso(usuarioId, apiKey);
  if (!acceso.ok) {
    return res.status(acceso.status).json({ error: acceso.error, requiereTerminos: acceso.requiereTerminos });
  }

  try {
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };

    const respuesta = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLA_BIENESTAR}`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        records: [
          {
            fields: {
              [F_BIENESTAR.fecha]: new Date().toISOString(),
              [F_BIENESTAR.usuario]: [usuarioId],
              [F_BIENESTAR.energia]: String(energia),
              [F_BIENESTAR.animo]: String(animo),
              [F_BIENESTAR.sueno]: String(sueno),
              [F_BIENESTAR.digestion]: String(digestion),
            },
          },
        ],
        typecast: true,
      }),
    });

    const data = await respuesta.json();
    if (!respuesta.ok) {
      throw new Error(data.error?.message || "Error creando el registro en Airtable");
    }

    return res.status(200).json({ ok: true, id: data.records[0].id });
  } catch (err) {
    console.error("Error en registrar-bienestar:", err);
    return res.status(500).json({ error: "Error procesando el registro de bienestar" });
  }
}
