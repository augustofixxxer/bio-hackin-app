// api/aceptar-terminos.js
// Recibe POST con { usuarioId, condicionMedica? } y:
// 1) marca Terminos Aceptados = true en Usuarios Real (guarda condicionMedica si vino)
// 2) crea un registro inmutable en "Log Aceptacion Terminos" con fecha UTC, versión e IP.

const BASE_ID = "appVzRFXuykP2ZBvR";
const TABLA_USUARIOS = "tblJDf0WF5eCTWxLt";
const TABLA_LOG = "tblJQQ0L5psSObPcy";

const F_USUARIOS = {
  terminosAceptados: "fld2IGCUNz35rdAhh",
  condicionMedica: "fldq0IHN1tl6WfcMB",
};

const F_LOG = {
  usuario: "fldHHPtwfrkFlO6zO",
  fecha: "fldXDscj87oK2y5vP",
  version: "fldgHOX7vgCKYLLEi",
  ip: "flds9rzQ508vIR9zI",
};

// Subí este número cada vez que cambies el texto legal de los Términos —
// así el log queda trazable a qué versión aceptó cada usuario.
const VERSION_TERMINOS_ACTUAL = "1.0";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido, usar POST." });
  }

  const apiKey = process.env.AIRTABLE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Falta configurar AIRTABLE_API_KEY." });
  }

  const { usuarioId, condicionMedica } = req.body || {};
  if (!usuarioId || typeof usuarioId !== "string") {
    return res.status(400).json({ error: "Falta usuarioId." });
  }

  const ipHeader = req.headers["x-forwarded-for"] || "";
  const ip = String(ipHeader).split(",")[0].trim() || req.socket?.remoteAddress || "desconocida";

  try {
    const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };

    const patchResp = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLA_USUARIOS}/${usuarioId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        fields: {
          [F_USUARIOS.terminosAceptados]: true,
          ...(typeof condicionMedica === "boolean" ? { [F_USUARIOS.condicionMedica]: condicionMedica } : {}),
        },
        typecast: true,
      }),
    });
    if (!patchResp.ok) {
      const err = await patchResp.json();
      throw new Error(err.error?.message || "No se pudo actualizar el usuario");
    }

    const logResp = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLA_LOG}`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        records: [
          {
            fields: {
              [F_LOG.usuario]: [usuarioId],
              [F_LOG.fecha]: new Date().toISOString(),
              [F_LOG.version]: VERSION_TERMINOS_ACTUAL,
              [F_LOG.ip]: ip,
            },
          },
        ],
        typecast: true,
      }),
    });
    if (!logResp.ok) {
      const err = await logResp.json();
      throw new Error(err.error?.message || "No se pudo guardar el log de aceptación");
    }

    return res.status(200).json({ ok: true, version: VERSION_TERMINOS_ACTUAL });
  } catch (err) {
    console.error("Error en aceptar-terminos:", err);
    return res.status(500).json({ error: "Error registrando la aceptación de términos" });
  }
}
