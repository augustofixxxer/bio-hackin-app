// api/_clasificador-ia.js
// Capa de "entendimiento" (no de "decisión") — Sprint 9, recomendado y nunca implementado
// hasta hoy (25/07/2026). Usa Groq (modelos de código abierto, nivel gratuito) para
// reconocer qué categorías de alimento aparecen en el texto libre que escribió el usuario.
//
// BLINDAJE LEGAL — leer antes de tocar este archivo:
// - La IA NUNCA genera texto libre que el usuario vaya a leer. Solo puede devolver
//   valores de una lista cerrada (CATEGORIAS_PERMITIDAS), forzado por "Structured
//   Outputs" con schema estricto de Groq (additionalProperties:false + enum) — el
//   modelo no puede inventar categorías nuevas ni "colarse" con lenguaje médico.
// - La IA nunca decide si algo es bueno/malo/riesgoso. Eso lo siguen decidiendo
//   exclusivamente las reglas ya aprobadas en Supabase (tabla "reglas"), igual que hoy.
// - Si Groq falla, tarda de más, o no está configurada: se devuelve null y
//   registrar-comida.js sigue funcionando exactamente igual que hoy (sinónimos +
//   reglas), sin bloquear ni degradar la experiencia del usuario. No intrusivo,
//   mismo criterio que emitirEvento().
//
// Mismo patrón de archivo único que _instrumentacion.js y _supabase.js — no separar
// en lib/ (lección Sprint 16).

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// Lista cerrada — cada valor corresponde 1:1 a una palabra que las reglas de Supabase
// ya reconocen literalmente (ver reglas.palabras_clave). Ampliar esta lista es barato
// (agregar una línea acá + el sinónimo correspondiente en registrar-comida.js), pero
// SIEMPRE debe ser una palabra ya usada por una regla real — nunca un criterio nuevo.
const CATEGORIAS_PERMITIDAS = [
  "carne_roja", "pollo", "pescado", "legumbres", "lacteos", "harinas_refinadas",
];

// Traduce la categoría de la IA a la palabra literal que las reglas ya reconocen.
const MAPA_A_PALABRA_REGLA = {
  carne_roja: "carne roja",
  pollo: "pollo",
  pescado: "pescado",
  legumbres: "legumbres",
  lacteos: "lacteos",
  harinas_refinadas: "harinas",
};

const SYSTEM_PROMPT = `Sos un clasificador de texto, no un asistente conversacional.
Tu única tarea: identificar qué categorías de una lista cerrada están presentes en la
descripción de una comida. Reglas estrictas:
- SOLO podés usar valores de esta lista: ${CATEGORIAS_PERMITIDAS.join(", ")}.
- Si no reconocés ninguna con confianza, devolvé una lista vacía.
- NUNCA dés consejos, opiniones, advertencias, ni juicios de valor sobre la comida.
- NUNCA agregues texto fuera del JSON pedido.`;

const JSON_SCHEMA = {
  type: "object",
  properties: {
    categorias: {
      type: "array",
      items: { type: "string", enum: CATEGORIAS_PERMITIDAS },
    },
  },
  required: ["categorias"],
  additionalProperties: false,
};

/**
 * Devuelve un array de palabras (ya traducidas al lenguaje de las reglas) o null
 * si la IA no está configurada, falla, o tarda de más. Nunca lanza excepción.
 */
async function clasificarComidaIA(texto) {
  if (!GROQ_API_KEY) return null; // dormido hasta que exista la clave en Vercel

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000); // no bloquea más de 3s

  try {
    const resp = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b", // único modelo de Groq con Structured Outputs estricto
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: texto },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "clasificacion_comida", strict: true, schema: JSON_SCHEMA },
        },
        max_completion_tokens: 150,
        temperature: 0,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      console.error("[clasificador-ia] Groq respondió", resp.status);
      return null;
    }

    const data = await resp.json();
    const contenido = data.choices?.[0]?.message?.content;
    if (!contenido) return null;

    const parsed = JSON.parse(contenido);
    const categorias = Array.isArray(parsed.categorias) ? parsed.categorias : [];

    return categorias
      .filter((c) => CATEGORIAS_PERMITIDAS.includes(c))
      .map((c) => MAPA_A_PALABRA_REGLA[c]);
  } catch (err) {
    clearTimeout(timeoutId);
    console.error("[clasificador-ia] fallo no bloqueante:", err);
    return null; // el llamador sigue sin la IA, como si nunca se hubiera intentado
  }
}

export { clasificarComidaIA };
