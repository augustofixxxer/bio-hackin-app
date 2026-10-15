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
  return String(texto || "").toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "");
}

// Construye solo los apartados que justifican los ingredientes descritos.
// No genera una receta ni altera la ficha curada que ya devuelve el motor.
function construirProtocoloCulinarioAdaptativo(textoComida) {
  const t = normalizarProtocolo(textoComida);
  if (!t.trim()) return null;
  const contiene = (re) => re.test(t);
  const hayAlmidon = contiene(/\b(arroz|papa|papas|patata|batata|boniato|maiz|choclo|fideo|fideos|pasta|noqui|ñoqui|polenta|avena|lenteja|lentejas|garbanzo|garbanzos|poroto|porotos|frijol|frijoles|legumbres|quinoa|pan|tortilla|harina|empanada|pizza|batata|mandioca|yuca)\b/);
  const hayVegetales = contiene(/\b(verdura|verduras|vegetal|vegetales|ensalada|lechuga|rucula|espinaca|acelga|brocoli|coliflor|repollo|tomate|zanahoria|cebolla|morr[oó]n|pimiento|zapallito|zucchini|berenjena|pepino|esparrago|chaucha|calabaza)\b/);
  const hayProteinaAnimal = contiene(/\b(carne|vacuno|ternera|cerdo|pollo|pavo|pescado|atun|salmon|merluza|huevo|huevos|marisco|langostino|camaron)\b/);
  const hayLegumbres = contiene(/\b(lenteja|lentejas|garbanzo|garbanzos|poroto|porotos|frijol|frijoles|legumbres|arveja|arvejas|haba|habas)\b/);
  const hayCucurma = contiene(/\b(curcuma|turmeric)\b/);
  const hayJengibre = contiene(/\b(jengibre)\b/);
  const hayComino = contiene(/\b(comino)\b/);
  const hayAjoCebolla = contiene(/\b(ajo|cebolla)\b/);
  const hayFrito = contiene(/\b(frito|frita|fritos|fritas|rebozado|rebozada|milanesa)\b/);
  const haySopaGuiso = contiene(/\b(sopa|guiso|estofado|cazuela|olla)\b/);
  const hayGrasaNombrada = contiene(/\b(manteca|ghee|grasa vacuna|sebo|aceite de oliva|oliva)\b/);

  const coccion = haySopaGuiso
    ? "Como ya es una preparación húmeda (sopa, guiso o estofado), mantené un hervor suave y la olla tapada para conservar humedad; evitá reducirla a fuego fuerte."
    : hayFrito
      ? "Como la preparación se describe frita o rebozada, evitá recalentarla sumergiéndola otra vez en aceite; si querés recuperar textura, usá horno o plancha y controlá el dorado."
      : hayProteinaAnimal
        ? "Para la proteína que nombraste, elegí una cocción pareja: olla tipo Essen tapada si buscás conservar humedad, o plancha de hierro para sellar sin apurar el dorado."
        : hayVegetales
          ? "Para los vegetales nombrados, priorizá salteado breve o cocción tapada a fuego medio-bajo; ajustá el tiempo a cada vegetal para evitar que todo se pase."
          : "La descripción no especifica una técnica ni una proteína concreta: elegí olla tapada a fuego medio-bajo para preparaciones húmedas o plancha de hierro para sellar, según el plato.";
  const grasa = hayGrasaNombrada
    ? "La descripción ya incluye una materia grasa; usá solo la necesaria y evitá sobrecalentarla."
    : "Si necesitás materia grasa para cocinar, usá poca cantidad de aceite de oliva virgen extra o manteca real a temperatura moderada; no hace falta agregarla si la preparación no la requiere.";

  let condimentos;
  if (hayCucurma) condimentos = "Como la comida incluye cúrcuma, acompañala con una pizca de pimienta negra y una base grasa si la preparación la necesita. " + (hayJengibre ? "El jengibre ya nombrado puede completar el perfil aromático." : hayComino ? "El comino ya nombrado puede reforzar el perfil especiado." : "No sumes otras especias por sistema: elegí jengibre, comino u orégano solo si combinan con el ingrediente principal.");
  else if (hayJengibre && hayComino) condimentos = "El jengibre y el comino ya aparecen en la descripción; ajustá ambos al ingrediente principal y evitá sumar cúrcuma automáticamente.";
  else if (hayJengibre) condimentos = "Como aparece jengibre, usalo en cantidad moderada y combiná el resto con el ingrediente principal; no hace falta añadir cúrcuma si no forma parte de tu receta.";
  else if (hayComino) condimentos = "El comino ya está contemplado en la preparación; podés equilibrarlo con ajo/cebolla si están presentes, sin acumular especias innecesarias.";
  else if (hayAjoCebolla) condimentos = "Como la preparación incluye ajo o cebolla, usalos como base aromática y agregá orégano, tomillo o laurel solo si encajan con el plato.";
  else if (hayLegumbres) condimentos = "Para las legumbres nombradas, comino, laurel u orégano son opciones compatibles; elegí uno o dos según el sabor buscado, sin añadirlos todos.";
  else if (hayProteinaAnimal) condimentos = "Para la proteína nombrada, elegí una combinación simple de pimienta y orégano o tomillo; reservá cúrcuma, jengibre o comino para cuando encajen con el plato.";
  else condimentos = "No hay un condimento concreto identificado en el texto: elegí hierbas o especias según el ingrediente principal, en lugar de añadir una mezcla fija.";

  const protocolo = {
    coccion: coccion + " " + grasa,
    condimentos,
  };
  if (hayAlmidon || hayVegetales) {
    protocolo.timingOrden = hayVegetales && hayAlmidon
      ? "Como el plato incluye vegetales y un alimento con almidón, empezá por la porción de vegetales y seguí con el resto de la comida; mantené la misma combinación al comparar cómo te sentís."
      : hayAlmidon
        ? "La descripción incluye un alimento con almidón pero no identifica vegetales: si tenés vegetales disponibles, podés comerlos primero; no se presupone que ya formen parte del plato."
        : "La descripción incluye vegetales pero no identifica almidones: podés comenzar por ellos, sin necesidad de imponer un orden de macronutrientes.";
  }
  if (hayAlmidon) {
    protocolo.almidonResistente = hayLegumbres
      ? "Como aparecen legumbres (y pueden coexistir con otros almidones), podés cocinar con antelación, enfriar en heladera y recalentar bien cuando corresponda; el enfriado también puede aumentar el almidón resistente en arroz o papa si forman parte del plato."
      : contiene(/\b(arroz)\b/) && contiene(/\b(papa|papas|patata|batata|boniato)\b/)
        ? "La descripción incluye arroz y papa/batata: si preparás una porción extra, enfriá pronto en heladera durante 12–24 h y recalentá bien; hacelo solo con sobrantes conservados de forma segura."
        : contiene(/\b(arroz)\b/)
          ? "Como el plato incluye arroz, podés preparar una porción con antelación, enfriarla pronto en heladera durante 12–24 h y recalentarla bien; conservá el arroz de forma segura y no lo dejes horas a temperatura ambiente."
          : contiene(/\b(papa|papas|patata|batata|boniato|mandioca|yuca)\b/)
            ? "Como el plato incluye papa, batata o mandioca, podés enfriar una porción cocida en heladera durante 12–24 h y recalentarla bien; conservá los sobrantes de forma segura."
            : "Como el plato incluye un alimento con almidón o una legumbre, podés cocinarlo con antelación, enfriarlo pronto en heladera y recalentarlo bien; el enfriado puede aumentar el almidón resistente, aunque el efecto depende del alimento y la preparación.";
  }
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

export { elegirTipRelevanteIA, elegirFichaHeladeraIA, PROTOCOLO_CULINARIO_CANONICO };
// END: /api/_selector-tips-ia.js
