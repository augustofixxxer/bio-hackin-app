// api/_clasificador-ia.js
// Capa de "entendimiento" (no de "decisión") — clasifica categorías cerradas y exige
// evidencia léxica explícita en el texto original antes de devolverlas.
// Blindaje: la IA no puede introducir una categoría que el usuario no haya expresado.

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const CATEGORIAS_PERMITIDAS = [
  "carne_roja", "pollo", "pescado", "legumbres", "lacteos", "harinas_refinadas",
];

const MAPA_A_PALABRA_REGLA = {
  carne_roja: "carne roja",
  pollo: "pollo",
  pescado: "pescado",
  legumbres: "legumbres",
  lacteos: "lacteos",
  harinas_refinadas: "harinas",
};

// La IA puede interpretar sinónimos, pero nunca puede inventar una categoría.
// Cada categoría devuelta debe tener además una evidencia explícita en el texto original.
const EVIDENCIA_LEXICA = {
  carne_roja: ["carne roja","bife","churrasco","vacio","matambre","costilla","cuadril","lomo","peceto","nalga","bondiola","carnaza","tapa","asado","parrillada","colita","entraña"],
  pollo: ["pollo","suprema","pechuga","muslo","supremas"],
  pescado: ["pescado","salmon","atun","merluza","trucha","mero","corvina","pejerrey","boga","surubi","abadejo"],
  legumbres: ["legumbres","garbanzos","porotos","habas","arvejas","lentejas"],
  lacteos: ["lacteos","queso","quesos","leche","crema","yogur","yogurt","ricota"],
  harinas_refinadas: ["harina","fideos","pasta","pan","tostado","empanada","ravioles","lasana","canelones"],
};

const normalizarTexto = (texto) =>
  String(texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const tieneEvidenciaLexica = (texto, categoria) => {
  const normalizado = normalizarTexto(texto);
  return (EVIDENCIA_LEXICA[categoria] || []).some((termino) =>
    normalizado.includes(normalizarTexto(termino))
  );
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

async function clasificarComidaIA(texto) {
  if (!GROQ_API_KEY) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const resp = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: texto },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "clasificacion_comida", strict: true, schema: JSON_SCHEMA },
        },
        reasoning_effort: "low",
        max_completion_tokens: 300,
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
      .filter((c) => tieneEvidenciaLexica(texto, c))
      .map((c) => MAPA_A_PALABRA_REGLA[c]);
  } catch (err) {
    clearTimeout(timeoutId);
    console.error("[clasificador-ia] fallo no bloqueante:", err);
    return null;
  }
}

export { clasificarComidaIA };
