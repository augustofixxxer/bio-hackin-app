// api/registrar-consentimiento-riesgo.js
// Recibe POST con { usuarioId, bloqueo, nivelRiesgo } y crea un log inmutable
// cada vez que un usuario confirma haber leído un bloqueo de riesgo Medio/Alto/Experimental.

const BASE_ID = "appVzRFXuykP2ZBvR";
const TABLA_LOG = "tbluw0Ylavf4ghS0A";

const F_LOG = {
  usuario: "fldjEy8NpR1D5vaIx",
  bloqueo: "fldRDMkd4u4GOpX5R",
  nivel: "fld8dE4jreGCtaQ12",
  fecha: "fldhJWMkv5HSFdleh",
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido, usar POST." });
  }

  const apiKey = process.env.AIRTABLE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Falta configurar AIRTABLE_API_KEY." });
  }

  const { usuarioId, bloqueo, nivelRiesgo } = req.body || {};
  if (!usuarioId || !bloqueo || !nivelRiesgo) {
    return res.status(400).json({ error: "Faltan datos (usuarioId, bloqueo, nivelRiesgo)." });
  }

  try {
    const resp = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLA_LOG}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        records: [
          {
            fields: {
              [F_LOG.usuario]: [usuarioId],
              [F_LOG.bloqueo]: bloqueo,
              [F_LOG.nivel]: nivelRiesgo,
              [F_LOG.fecha]: new Date().toISOString(),
            },
          },
        ],
        typecast: true,
      }),
    });
    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error?.message || "No se pudo guardar el consentimiento");
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Error en registrar-consentimiento-riesgo:", err);
    return res.status(500).json({ error: "Error registrando el consentimiento" });
  }
}
