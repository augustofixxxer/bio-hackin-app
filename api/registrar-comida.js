// Función serverless (Vercel). Recibe POST con { texto, momento, usuarioId }.
// Detecta coincidencias con las Reglas por palabras clave, crea el Registro Diario
// y los Bloqueos correspondientes en Supabase (Postgres).

import { emitirEvento } from "./_instrumentacion.js";

function normalizar(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function escapeRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function contienePalabraCompleta(textoNormalizado, clave) {
  const patron = new RegExp(`\\b${escapeRegex(clave)}\\b`);
  return patron.test(textoNormalizado);
}

// Evalúa una Regla contra el texto normalizado.
// Formato del campo "palabras_clave":
//   - Sin ";": lista simple, alcanza con que aparezca UNA cualquiera (regla de un solo alimento).
//   - Con UN ";": "Grupo A ; Grupo B" -> necesita al menos una palabra de CADA grupo (combinación real).
//   - Con DOS ";": "Grupo A ; Grupo B ; Disparadores" -> además de la combinación, cualquier
//     palabra de "Disparadores" alcanza sola (para platos compuestos que ya implican ambos, ej. "milanesa napolitana").
//   - Prefijo "TIP:" al inicio -> no es una alerta, es un tip positivo (no bloquea, se muestra distinto).
function evaluarRegla(textoNormalizado, palabrasClaveRaw) {
  let raw = (palabrasClaveRaw || "").trim();
  let esTip = false;
  if (/^tip:/i.test(raw)) {
    esTip = true;
    raw = raw.replace(/^tip:/i, "").trim();
  }

  const segmentos = raw
    .split(";")
    .map((seg) =>
      seg
        .split(",")
        .map((k) => normalizar(k.trim()))
        .filter(Boolean)
    )
    .filter((grupo) => grupo.length > 0);

  let coincide = false;
  if (segmentos.length <= 1) {
    const grupo = segmentos[0] || [];
    coincide = grupo.some((clave) => contienePalabraCompleta(textoNormalizado, clave));
  } else {
    const [grupoA, grupoB, disparadores] = segmentos;
    const matchA = grupoA.some((clave) => contienePalabraCompleta(textoNormalizado, clave));
    const matchB = grupoB.some((clave) => contienePalabraCompleta(textoNormalizado, clave));
    const matchDisparador = (disparadores || []).some((clave) => contienePalabraCompleta(textoNormalizado, clave));
    coincide = (matchA && matchB) || matchDisparador;
  }

  return { coincide, esTip };
}

const PALABRAS_CASERO = ["casera", "caseras", "casero", "caseros", "en casa", "hecho en casa", "hecha en casa"];

function esVersionCasera(textoNormalizado) {
  return PALABRAS_CASERO.some((p) => textoNormalizado.includes(normalizar(p)));
}

// ---- Capa de datos: Supabase vía REST (PostgREST), sin SDK, mismo patrón que antes con Airtable ----

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
    res.status(405).json({ error: "Método no permitido, usar POST." });
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    res.status(500).json({ error: "Falta configurar SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY." });
    return;
  }

  const { texto, momento, usuarioId } = req.body || {};
  if (!texto || typeof texto !== "string" || texto.trim().length === 0) {
    res.status(400).json({ error: "Falta el texto de la comida registrada." });
    return;
  }

  if (usuarioId) {
    try {
      const acceso = await verificarAcceso(usuarioId);
      if (!acceso.ok) {
        return res.status(acceso.status).json({ error: acceso.error, requiereTerminos: acceso.requiereTerminos });
      }
    } catch (err) {
      res.status(400).json({ error: "El usuarioId recibido no es válido.", detail: String(err) });
      return;
    }
  }

  try {
    const textoNormalizado = normalizar(texto);
    const versionCasera = esVersionCasera(textoNormalizado);

    // 1. Traer las Reglas con su Solución ya embebida (join nativo de Supabase, en un solo viaje)
    const reglas = await supabaseFetch(
      `reglas?select=id,combinacion,resultado,palabras_clave,nivel_riesgo,soluciones(nombre_hackeo,adaptacion)`
    );

    // 2. Buscar coincidencias: separamos bloqueos reales (combinaciones) de tips positivos
    const evaluaciones = reglas.map((r) => ({
      regla: r,
      ...evaluarRegla(textoNormalizado, r.palabras_clave),
    }));
    const coincidencias = evaluaciones.filter((e) => e.coincide && !e.esTip).map((e) => e.regla);
    const coincidenciasTip = evaluaciones.filter((e) => e.coincide && e.esTip).map((e) => e.regla);

    // 2b. Si el texto indica versión casera, esas coincidencias quedan "resueltas"
    // (ya se aplicó el hackeo) y no se tratan como bloqueo real.
    const bloqueosReales = versionCasera ? [] : coincidencias;
    const resueltos = versionCasera ? coincidencias : [];

    // 3. Crear el Registro Diario
    const fechaHoy = new Date().toISOString().split("T")[0];
    const registroCreado = await supabaseFetch(`registro_diario_real`, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        fecha: fechaHoy,
        comida_registrada: texto,
        ...(momento ? { momento_dia: momento } : {}),
        ...(usuarioId ? { usuario_id: usuarioId } : {}),
      }),
    });
    const registroId = registroCreado[0].id;

    // 4. Si no hay coincidencias reales, no se crean Bloqueos
    let bloqueosCreados = [];
    if (bloqueosReales.length > 0) {
      bloqueosCreados = await supabaseFetch(`bloqueos`, {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(
          bloqueosReales.map((r) => ({
            nombre_bloqueo: r.combinacion || "Bloqueo detectado",
            comida_o_bebida: texto,
            fecha_deteccion: fechaHoy,
            registro_diario_id: registroId,
          }))
        ),
      });
    }

    // 5. Armar bloqueos reales con su solución (ya viene embebida desde el paso 1)
    const bloqueos = bloqueosReales.map((r, i) => ({
      combinacion: r.combinacion || "",
      resultado: r.resultado || "",
      nivelRiesgo: r.nivel_riesgo || "Bajo",
      solucion: r.soluciones
        ? { nombre: r.soluciones.nombre_hackeo || "", adaptacion: r.soluciones.adaptacion || "" }
        : null,
      bloqueoId: bloqueosCreados[i]?.id,
    }));

    // 6. Armar resueltos (versión casera) como refuerzo positivo, sin crear Bloqueo
    const resueltosRespuesta = resueltos.map((r) => ({
      combinacion: r.combinacion || "",
      mensaje: "Ya aplicaste este hackeo con la versión casera.",
      solucion: r.soluciones
        ? { nombre: r.soluciones.nombre_hackeo || "", adaptacion: r.soluciones.adaptacion || "" }
        : null,
    }));

    // 7. Tips positivos de Reglas (siempre se muestran, marcadas con "TIP:" en Supabase)
    let sugerencias = coincidenciasTip.map((r) => ({
      nombre: r.combinacion || "",
      mecanismo: r.resultado || "",
      opcion: "",
      evidencia: "",
    }));

    // 7b. Si no hay bloqueos reales, sumamos tips positivos en Alternativas locales
    // (comparación por palabra completa —con una raíz simple de plural—, no por substring:
    // esto evita que "ensalada" matchee por ser parte de "ensaladas").
    if (bloqueosReales.length === 0) {
      const alternativas = await supabaseFetch(
        `alternativas_locales?select=mecanismo,descripcion_mecanismo,recomendacion,nivel_evidencia`
      );
      const tokenizar = (t) => (t || "").split(/[^a-z0-9]+/).filter((p) => p.length > 3);
      const raiz = (p) => (p.length > 4 && p.endsWith("s") ? p.slice(0, -1) : p);
      // Palabras genéricas que no identifican a un alimento específico: si matchean solas,
      // generan falsos positivos (ej. "ensalada" enganchando la ficha de la lechuga).
      const GENERICAS = new Set([
        "ensalada", "ensaladas", "comida", "comidas", "plato", "platos", "alimento",
        "alimentos", "base", "fresca", "fresco", "frescos", "frescas", "opcion",
        "opciones", "saludable", "saludables", "diaria", "diario", "buena", "bueno",
        "aporte", "util", "utiles",
      ].map(raiz));
      const coincidenciasAlternativas = alternativas.filter((a) => {
        const candidatos = new Set([
          ...tokenizar(normalizar(a.mecanismo || "")).map(raiz),
          ...tokenizar(normalizar(a.recomendacion || "")).map(raiz),
        ]);
        const palabrasTexto = tokenizar(textoNormalizado)
          .map(raiz)
          .filter((p) => !GENERICAS.has(p));
        return palabrasTexto.some((p) => candidatos.has(p) && !GENERICAS.has(p));
      });
      sugerencias = sugerencias.concat(
        coincidenciasAlternativas.slice(0, 2).map((a) => ({
          nombre: a.mecanismo || "",
          mecanismo: a.descripcion_mecanismo || "",
          opcion: a.recomendacion || "",
          evidencia: a.nivel_evidencia || "",
        }))
      );
    }

    // --- MIS Etapa 1 — Piloto de Instrumentación (DC-05). Único agregado de este archivo. ---
    // No intrusivo: emitirEvento nunca lanza, un fallo interno se loguea y se descarta (Directiva 2).
    await emitirEvento({
      usuarioId,
      eventType: "comida_registrada",
      sourceComponent: "registrar-comida",
      requestingComponent: "registrar-comida",
      payload: { registroId, bloqueosCount: bloqueos.length, versionCasera },
    });

    res.status(200).json({ registroId, bloqueos, resueltos: resueltosRespuesta, sugerencias });
  } catch (err) {
    res.status(500).json({ error: "Error procesando el registro", detail: String(err) });
  }
}
