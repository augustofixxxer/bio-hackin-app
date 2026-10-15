// api/_selector-tips-ia.js
//
// Reemplaza al matching por palabras sueltas contra alternativas_locales (desactivado
// 31/07/2026 tras 5 falsos positivos reales y consecutivos: carne, salsa, harina, leche,
// queso — ver historial en registrar-comida.js). Ese mecanismo ADIVINABA relevancia
// comparando palabras; este ENTIENDE, usando la misma IA (Groq) que ya clasifica la
// comida para el motor de bloqueos.
//
// Deliberadamente un módulo aparte, un segundo llamado a Groq independiente del de
// _clasificador-ia.js (Opción B, elegida por Augusto el 31/07/2026 sobre la alternativa de
// fusionar todo en un solo llamado): si esto falla, se apaga solo, sin arriesgar el motor
// de bloqueos que ya funciona. Recuperable en minutos — ver "CÓMO APAGAR ESTO" al final.
//
// BLINDAJE LEGAL — mismo criterio que _clasificador-ia.js:
// - Groq NUNCA elige libremente: solo puede devolver uno de los IDs reales que le
//   pasamos en la lista, o "ninguna". No puede inventar una ficha que no exista —
//   forzado por Structured Outputs con enum estricto armado con los IDs reales de
//   este pedido puntual.
// - Groq nunca redacta el tip — solo elige CUÁL de las fichas ya escritas y aprobadas
//   mostrar. El texto final siempre sale de Supabase, nunca de la IA.
// - Si Groq falla, tarda de más, o no está configurada: devuelve null y
//   registrar-comida.js sigue mostrando "sin tip" — nunca bloquea ni degrada nada más.
//
// Mismo patrón de archivo único que el resto de api/_*.js — no separar en lib/ (Sprint 16).

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const SYSTEM_PROMPT = `Sos un selector, no un asistente conversacional ni un nutricionista.
Se te da el texto de una comida y una lista numerada de fichas (nombre corto de cada una).
Tu única tarea: elegir el ID de la ficha más relevante para esa comida específica, solo si
la relación es clara y directa — no por compartir un ingrediente suelto o común.
Reglas estrictas:
- SOLO podés devolver uno de los IDs de la lista que se te da, o "ninguna".
- Si ninguna ficha tiene relación clara y específica con la comida, devolvé "ninguna".
  Ante la duda, elegí "ninguna" — preferimos no mostrar nada antes que mostrar algo forzado.
- Un ingrediente común compartido (ej. "queso", "leche", "carne") NO alcanza por sí solo
  para considerar que hay relación — tiene que ser el plato/concepto central el que coincida.
- NUNCA agregues texto, consejos ni explicaciones fuera del JSON pedido.`;

/**
 * @param {string} texto - el texto de la comida que escribió el usuario
 * @param {Array<{id: string, mecanismo: string}>} fichas - candidatas reales de Supabase
 * @returns {Promise<string|null>} el id elegido, o null (sin IA / sin relación clara / error)
 */
async function elegirTipRelevanteIA(texto, fichas) {
  if (!GROQ_API_KEY) return null; // mismo criterio que _clasificador-ia.js: dormido sin key
  if (!fichas || fichas.length === 0) return null;

  const idsValidos = fichas.map((f) => f.id);
  const listaParaPrompt = fichas.map((f, i) => `${i + 1}. [${f.id}] ${f.mecanismo}`).join("\n");

  const jsonSchema = {
    type: "object",
    properties: {
      id_elegido: { type: "string", enum: [...idsValidos, "ninguna"] },
    },
    required: ["id_elegido"],
    additionalProperties: false,
  };

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
        model: "openai/gpt-oss-20b",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Comida: "${texto}"\n\nFichas disponibles:\n${listaParaPrompt}` },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "seleccion_tip", strict: true, schema: jsonSchema },
        },
        // Mismo fix que _clasificador-ia.js (29/07/2026): gpt-oss-20b necesita
        // reasoning_effort bajo y margen de tokens, o devuelve 400 sin llegar a
        // escribir el JSON final.
        reasoning_effort: "low",
        max_completion_tokens: 300,
        temperature: 0,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      console.error("[selector-tips-ia] Groq respondió", resp.status);
      return null;
    }

    const data = await resp.json();
    const contenido = data.choices?.[0]?.message?.content;
    if (!contenido) return null;

    const parsed = JSON.parse(contenido);
    const elegido = parsed.id_elegido;

    // Cinturón de seguridad extra: aunque el schema ya lo restringe, nunca confiamos
    // ciegamente en la respuesta de una IA — se revalida contra la lista real.
    return idsValidos.includes(elegido) ? elegido : null;
  } catch (err) {
    clearTimeout(timeoutId);
    console.error("[selector-tips-ia] fallo no bloqueante:", err);
    return null;
  }
}

// CÓMO APAGAR ESTO si algo sale mal en producción (recuperable en minutos, sin tocar
// nada más de la app): en registrar-comida.js, la línea que llama a
// elegirTipRelevanteIA(...) — comentarla o hacer que la función de más arriba retorne
// null directo acá arriba (return null; como primera línea de elegirTipRelevanteIA).
// El resto de la app (bloqueos, clasificador de comida, todo lo demás) sigue intacto.


const PROTOCOLO_CULINARIO_CANONICO = {
  coccion: "Priorizar cocción a fuego lento en cacerola/sartén tipo Essen con tapa, reteniendo humedad, o sellado en plancha/sartén de hierro. Como materia grasa para cocinar a temperatura media/baja: manteca real, grasa vacuna (cebo) o aceite de oliva virgen extra. Evitar aceites de semilla refinados.",
  condimentos: "Si el plato incluye cúrcuma, combinarla con una pizca de pimienta negra recién molida y una base grasa. Incorporar jengibre fresco o en polvo, comino, orégano, tomillo o laurel según el ingrediente base.",
  fibra: "Si la preparación contiene almidones (arroz, papas, fideos) u otros carbohidratos, iniciar la ingesta con una porción de fibra o vegetales verdes/crujientes.",
  almidonResistente: "Para arroces, papas o legumbres, promover el enfriado previo durante 12–24 horas como mínimo en heladera y luego un recalentado suave."
};

const HELADERA_SYSTEM_PROMPT = `Sos un selector de fichas existentes para una consulta de cocina.
Recibís ingredientes disponibles y fichas ya curadas en la base.
Elegí una ficha SOLO si coincide de forma clara con los ingredientes y aporta una preparación útil.
No inventes recetas, ingredientes, cantidades ni atribuciones a una ficha.
El siguiente protocolo es contexto canónico del producto para reconocer pertinencia culinaria; no lo redactes ni lo devuelvas como si proviniera de una ficha seleccionada:
${JSON.stringify(PROTOCOLO_CULINARIO_CANONICO)}
Tu única tarea es elegir un ID real de la lista o "ninguna". No escribas explicaciones. Devolvé únicamente el JSON pedido.
Si no hay una ficha suficientemente pertinente, devolvé "ninguna".`;


function normalizarProtocolo(texto) {
  return String(texto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Construye solo los apartados que justifican los ingredientes descritos.
// No genera una receta ni altera la ficha curada que ya devuelve el motor.
function construirProtocoloCulinarioAdaptativo(textoComida, reglasConfiguradas = []) {
  const t = normalizarProtocolo(textoComida);
  if (!t.trim()) return null;

  const reglasBase = [
    {
      clave: "legumbres_maiz_granos",
      terminos: ["lenteja","lentejas","garbanzo","garbanzos","poroto","porotos","frijol","frijoles","arveja","arvejas","haba","habas","legumbre","legumbres","maiz","choclo","quinoa","avena","cebada","centeno","mijo","trigo burgol","bulgur","grano","granos","arroz","polenta"],
      reglas: {
        sinergia: "Usá comino, laurel y pimienta negra como sinergia de condimentos; ajustá la intensidad al plato y a tu tolerancia.",
        coccion: "Cociná a fuego lento en olla tapada hasta que los ingredientes queden tiernos; mantené un hervor suave.",
        almidonResistente: "Prepará la porción con antelación, enfriá rápidamente y conservá en heladera durante 12–24 horas antes de recalentarla bien. No dejes la comida horas a temperatura ambiente."
      }
    },
    {
      clave: "almidones_pesados",
      terminos: ["arroz","papa","papas","patata","patatas","batata","boniato","pasta","fideo","fideos","ñoqui","ñoquis","noqui","noquis","mandioca","yuca"],
      reglas: {
        timingOrden: "Empezá la ingesta con una porción de vegetales verdes o fibra y después seguí con el alimento con almidón.",
        almidonResistente: "Priorizá enfriar previamente una porción cocida durante 12–24 horas en heladera y después recalentala bien. Enfriá pronto y conservá de forma segura."
      }
    },
    {
      clave: "carnes_grasas_densas",
      terminos: ["carne","vacuno","ternera","cerdo","pollo","pavo","pescado","atun","salmon","merluza","cordero","chorizo","panceta","tocino","manteca","grasa vacuna","sebo","crema","crema de leche"],
      reglas: {
        coccion: "Sellá la carne en plancha de hierro o Essen usando una cantidad moderada de grasa vacuna (sebo), manteca real u oliva virgen extra; controlá el fuego y evitá quemar la superficie.",
        sinergia: "Combiná la proteína con ajo, cebolla, orégano, tomillo o jengibre; elegí una combinación breve que encaje con el plato."
      }
    }
  ];

  const reglasActivas = Array.isArray(reglasConfiguradas) && reglasConfiguradas.length
    ? reglasConfiguradas.filter((r) => r && r.activo !== false && Array.isArray(r.terminos) && r.reglas && typeof r.reglas === "object")
    : reglasBase;

  const gruposDetectados = reglasActivas
    .map((grupo) => {
      const coincide = (grupo.terminos || []).some((termino) => {
        const normalizado = normalizarProtocolo(termino).trim();
        if (!normalizado) return false;
        const patron = normalizado.split(/\s+/).map((parte) => parte.replace(/[.*+?^|]/g, "\\$&")).join("\\s+");
        return new RegExp("\\b" + patron + "\\b", "i").test(t);
      });
      return coincide ? grupo : null;
    })
    .filter(Boolean)
    .sort((a, b) => Number(a.prioridad || 100) - Number(b.prioridad || 100));

  const protocolo = {
    coccion: "Elegí una cocción controlada y adecuada al plato; mantené temperaturas moderadas y evitá quemar los ingredientes.",
    condimentos: "Elegí una combinación breve de hierbas y especias que encaje con el ingrediente principal, sin acumular condimentos innecesarios."
  };

  for (const grupo of gruposDetectados) {
    for (const [clave, texto] of Object.entries(grupo.reglas)) {
      if (typeof texto !== "string" || !texto.trim()) continue;
      if (!protocolo[clave]) protocolo[clave] = texto;
      else if (protocolo[clave] !== texto) protocolo[clave] += " " + texto;
    }
  }

  // Toda comida no vacía obtiene un protocolo accionable, sin comodines evasivos.
  return protocolo;
}
async function elegirFichaHeladeraIA(ingredientes, fichas) {
  if (!GROQ_API_KEY || !Array.isArray(fichas) || fichas.length === 0) return null;
  const idsValidos = fichas.map((f) => f.id);
  const lista = fichas.map((f, i) => `${i + 1}. [${f.id}] ${f.mecanismo}`).join("\n");
  const schema = { type:"object", properties:{ id_elegido:{type:"string",enum:[...idsValidos,"ninguna"]} }, required:["id_elegido"], additionalProperties:false };
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);
  try {
    const resp = await fetch(GROQ_URL, {
      method:"POST",
      headers:{"Content-Type":"application/json",Authorization:`Bearer ${GROQ_API_KEY}`},
      body:JSON.stringify({
        model:"openai/gpt-oss-20b",
        messages:[
          {role:"system",content:HELADERA_SYSTEM_PROMPT},
          {role:"user",content:`Ingredientes disponibles: "${ingredientes}"\n\nFichas reales disponibles:\n${lista}`}
        ],
        response_format:{type:"json_schema",json_schema:{name:"seleccion_heladera",strict:true,schema}},
        reasoning_effort:"low",max_completion_tokens:300,temperature:0
      }),
      signal:controller.signal
    });
    clearTimeout(timeoutId);
    if(!resp.ok){console.error("[selector-heladera-ia] Groq respondió",resp.status);return null}
    const data=await resp.json();
    const contenido=data.choices?.[0]?.message?.content;
    if(!contenido)return null;
    const parsed=JSON.parse(contenido);
    return idsValidos.includes(parsed.id_elegido)?parsed.id_elegido:null;
  } catch(err) {
    clearTimeout(timeoutId);
    console.error("[selector-heladera-ia] fallo no bloqueante:",err);
    return null;
  }
}

export { elegirTipRelevanteIA, elegirFichaHeladeraIA, PROTOCOLO_CULINARIO_CANONICO, construirProtocoloCulinarioAdaptativo };
// END: /api/_selector-tips-ia.js
