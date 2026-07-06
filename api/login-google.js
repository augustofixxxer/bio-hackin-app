// api/login-google.js
// Recibe POST con { credential } (el JWT que entrega el botón de Google).
// Verifica ese token contra los servidores de Google, y busca o crea
// al usuario correspondiente en la tabla "Usuarios Real" de Airtable.

const BASE_ID = "appVzRFXuykP2ZBvR";
const TABLA_USUARIOS = "tblJDf0WF5eCTWxLt";
const GOOGLE_CLIENT_ID = "521828227436-s3qcdgb7ivd9aaaqifm1c20nat8ntcj1.apps.googleusercontent.com";

const F_EMAIL = "fldA1TM4B6yumsrEx";
const F_NOMBRE = "fld3AoueaKL9t8o8l";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido, usar POST." });
  }

  const apiKey = process.env.AIRTABLE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Falta configurar AIRTABLE_API_KEY." });
  }

  const { credential } = req.body || {};
  if (!credential || typeof credential !== "string") {
    return res.status(400).json({ error: "Falta el token de Google (credential)." });
  }

  try {
    // 1. Verificar el token contra los servidores de Google
    const verifyResp = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
    );
    const payload = await verifyResp.json();

    if (!verifyResp.ok || payload.error) {
      return res.status(401).json({ error: "Token de Google inválido o vencido." });
    }
    if (payload.aud !== GOOGLE_CLIENT_ID) {
      return res.status(401).json({ error: "El token no corresponde a esta app." });
    }

    const email = payload.email;
    const nombre = payload.name || payload.given_name || email;
    if (!email) {
      return res.status(400).json({ error: "Google no devolvió un email válido." });
    }

    const headers = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };

    // 2. Buscar si ya existe un usuario con ese email
    const formula = encodeURIComponent(`{Email} = '${email.replace(/'/g, "\\'")}'`);
    const buscarResp = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${TABLA_USUARIOS}?filterByFormula=${formula}`,
      { headers }
    );
    const buscarData = await buscarResp.json();
    if (!buscarResp.ok) {
      throw new Error(buscarData.error?.message || "Error consultando Airtable");
    }

    let usuarioId;

    if (buscarData.records && buscarData.records.length > 0) {
      // Ya existe: lo usamos tal cual
      usuarioId = buscarData.records[0].id;
    } else {
      // No existe: lo creamos
      const crearResp = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLA_USUARIOS}`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          records: [
            {
              fields: {
                [F_EMAIL]: email,
                [F_NOMBRE]: nombre,
              },
            },
          ],
          typecast: true,
        }),
      });
      const crearData = await crearResp.json();
      if (!crearResp.ok) {
        throw new Error(crearData.error?.message || "Error creando el usuario en Airtable");
      }
      usuarioId = crearData.records[0].id;
    }

    return res.status(200).json({ usuarioId, email, nombre });
  } catch (err) {
    console.error("Error en login-google:", err);
    return res.status(500).json({ error: "Error procesando el login", detail: String(err) });
  }
}
