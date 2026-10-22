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
  almidonResistente: "Si el usuario consulta por almidón resistente o preparación anticipada de arroz, papa o legumbres: enfriar rápidamente, refrigerar dentro de 1–2 horas y, tras 12–24 horas, recalentar bien. El enfriado puede aumentar el almidón resistente, pero el efecto glucémico varía; no presentarlo como obligación ni prometer una reducción fija."
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
  const t = normalizarProtocolo(textoComida).replace(/[^a-z0-9ñ\s-]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;

  // Reglas locales específicas: se usan solo como degradación si la matriz remota
  // no reconoce la entrada; nunca sustituyen una regla de Supabase que sí coincide.
  const reglasFallback = [
    {
      clave: "legumbres",
      terminos: ["lenteja","lentejas","garbanzo","garbanzos","poroto","porotos","frijol","frijoles","arveja","arvejas","haba","habas","legumbre","legumbres"],
      prioridad: 10,
      reglas: {
        sinergia: "SINERGIA DE CONDIMENTOS: comino + laurel + pimienta negra. Incorporá el laurel durante la cocción y ajustá comino y pimienta al gusto.",
        coccion: "Cociná las legumbres a hervor suave, en olla tapada, hasta que queden tiernas.",
        almidonResistente: "Si preparás una porción para después, enfriá pronto y guardala en heladera; recalentá bien antes de consumir."
      }
    },
    {
      clave: "almidones_pesados",
      terminos: ["arroz","papa","papas","patata","patatas","batata","boniato","pasta","fideo","fideos","ñoqui","ñoquis","noqui","noquis","mandioca","yuca","polenta"],
      prioridad: 20,
      reglas: {
        sinergia: "Para arroz, pastas o papas, usá una combinación breve de orégano + pimienta negra; si la salsa es de tomate, podés sumar albahaca.",
        timingOrden: "Si el plato se acompaña con vegetales, podés empezar por ellos y después seguir con el alimento con almidón.",
        almidonResistente: "Para arroz o papas cocidos con antelación, enfriá pronto y conservá en heladera; recalentá bien antes de consumir."
      }
    },
    {
      clave: "proteinas",
      terminos: ["carne","bife","churrasco","vacio","matambre","costilla","cuadril","lomo","asado","pollo","pavo","pescado","atun","salmon","merluza","cerdo","ternera","vacuno","cordero","huevo","huevos"],
      prioridad: 30,
      reglas: {
        coccion: "Para la proteína, buscá una cocción pareja y evitá quemar la superficie; ajustá el tiempo al corte y al grosor.",
        sinergia: "SINERGIA DE CONDIMENTOS: ajo + orégano + pimienta negra. Para pollo también combina tomillo; incorporá sal al gusto."
      }
    },
    {
      clave: "vegetales_fibra",
      terminos: ["ensalada","verde","lechuga","rucula","rúcula","espinaca","acelga","brocoli","brócoli","repollo","tomate","zanahoria","cebolla","morrón","pimiento","pepino","verdura","verduras","vegetales","vegetal"],
      prioridad: 40,
      reglas: {
        coccion: "Si es una ensalada verde, no requiere cocción: lavá y secá bien las hojas y cortá los vegetales justo antes de servir.",
        sinergia: "SINERGIA DE CONDIMENTOS: limón + pimienta negra + orégano. Agregá el limón al servir y ajustá la intensidad al gusto.",
        timingOrden: "Podés comenzar la comida con la ensalada y después continuar con el resto del plato, si lo hay."
      }
    }
  ];

  const coincideGrupo = (grupo) => (grupo.terminos || []).some((termino) => {
    const clave = normalizarProtocolo(termino).trim();
    if (!clave) return false;
    const patron = clave.split(/\s+/).map((parte) => parte.replace(/[.*+?^|]/g, "\\$&")).join("\\s+");
    return new RegExp("\\b" + patron + "\\b", "i").test(t);
  });
  const validarGrupo = (grupo) => grupo && grupo.activo !== false &&
    Array.isArray(grupo.terminos) && grupo.reglas && typeof grupo.reglas === "object";
  const configuradas = Array.isArray(reglasConfiguradas) ? reglasConfiguradas.filter(validarGrupo) : [];
  const gruposConfigurados = configuradas.filter(coincideGrupo);
  // Primero manda Supabase. Solo si la matriz remota no identifica esta entrada,
  // se activa una regla local específica por familia, nunca un texto neutro plantilla.
  const gruposDetectados = (gruposConfigurados.length ? gruposConfigurados : reglasFallback.filter(coincideGrupo))
    .sort((a, b) => Number(a.prioridad || 100) - Number(b.prioridad || 100));

  const esGuisoExplicito = /\bguiso\b/.test(t);
  const tieneArroz = /\barroz\b/.test(t);
  const tieneProteina = /\b(pollo|pechuga|carne|bife|bifes|churrasco|vacio|matambre|costilla|cuadril|lomo|asado|pavo|pescado|atun|salmon|merluza|cerdo|ternera|vacuno|cordero)\b/.test(t);
  const esProteinaConArrozGuarnicion = !esGuisoExplicito && tieneArroz && tieneProteina;

  const protocolo = {};
  for (const grupo of gruposDetectados) {
    for (const [clave, texto] of Object.entries(grupo.reglas)) {
      if (typeof texto !== "string" || !texto.trim()) continue;
      if (!protocolo[clave]) protocolo[clave] = texto;
      else if (protocolo[clave] !== texto && !protocolo[clave].includes(texto)) protocolo[clave] += " " + texto;
    }
  }

  // Regla de resolución: arroz + proteína no significa guiso salvo que el usuario
  // escriba explícitamente "guiso". En caso contrario, tratar el arroz como guarnición.
  if (esProteinaConArrozGuarnicion) {
    protocolo.coccion = "PREPARACIÓN POR COMPONENTES: cociná la proteína por separado (por ejemplo, sellada en plancha o sartén) y prepará el arroz hervido como guarnición. No asumir salsa, sofrito ni cocción conjunta.";
    protocolo.sinergia = "SINERGIA PARA PROTEÍNA + GUARNICIÓN: en la proteína, ajo + orégano + pimienta negra; en el arroz, perejil o pimienta al gusto. Mantené los condimentos separados si querés distinguir sus sabores.";
    protocolo.timingOrden = "El arroz funciona como guarnición y no implica un guiso. Si acompañás el plato con vegetales, podés incluirlos como parte de la comida.";
    protocolo.gruposDetectados = ["proteina_magra_grasa", "almidon_guarnicion"];
    protocolo.familiaDetectada = "proteina_magra_grasa + almidon_guarnicion";
  }

  // Resolver la variable por alimento antes de devolver el protocolo.
  // El enfriamiento no se recomienda por defecto: solo se aborda si la consulta
  // pregunta explícitamente por enfriar, recalentar o preparar con antelación.
  const esPasta = /\b(pasta|fideo|fideos|tallar[ií]n|tallarines|espagueti|espaguetis|spaghetti|macarr[oó]n|macarrones|ñoqui|ñoquis|noqui|noquis)\b/.test(t);
  const esTuberculo = /\b(papa|papas|patata|patatas|batata|boniato|yuca|mandioca)\b/.test(t);
  const esCereal = /\b(arroz|avena|ma[ií]z|cebada|trigo|quinoa|quinua|polenta)\b/.test(t);
  const pideEnfriamiento = /enfri|refriger|recalent|prepar.{0,15}antelaci|cocid.{0,15}despu[eé]s|para ma[nñ]ana/.test(t);
  const pideGrasa = /(?:agregar|añadir|anadir|sumar|reducir|quitar|menos|más|mas|cantidad de)\s+(?:aceite|manteca|crema|queso|grasa|aderezo)|(?:aceite|manteca|crema|queso|grasa|aderezo)\s+(?:añadid[oa]|anadid[oa]|agregad[oa]|extra|en mayor cantidad)|variable.{0,20}(?:aceite|grasa|aderezo)/.test(t);
  const pideTiming = /antes de comer|despu[eé]s de comer|orden de ingesta|primero.{0,20}(vegetal|ensalada|fibra)|horario|momento de ingesta/.test(t);
  const pideTipoPasta = /pasta integral|fideos integrales|pasta de legumbres|fideos de legumbres|tipo de pasta/.test(t);

  if (esPasta) {
    protocolo.familiaDetectada = "pasta";
    protocolo.variableModificada = pideTiming ? "timing" : pideGrasa ? "grasa_anadida" : pideTipoPasta ? "tipo_pasta" : pideEnfriamiento ? "enfriamiento_pasta" : "coccion_pasta";
    protocolo.coccion = "Para esta pasta, usá el tiempo y el punto de cocción indicados para el producto; no asumir enfriamiento previo como requisito.";
    if (!pideGrasa) protocolo.sinergia = /salsa de tomate|tomate/.test(t)
      ? "Para una salsa de tomate, albahaca u orégano son opciones compatibles; ajustá según el sabor que busques."
      : "No se especificó la salsa ni el tipo de pasta; no asigno una combinación de condimentos única. Indicá la salsa para afinar la sugerencia.";
    if (pideEnfriamiento) protocolo.almidonResistente = "Si la pasta se prepara con antelación, enfriá pronto y guardala en heladera; recalentá bien antes de consumir. No es un paso obligatorio para toda preparación.";
    else delete protocolo.almidonResistente;
  } else if (esTuberculo) {
    protocolo.familiaDetectada = "tuberculo";
    protocolo.variableModificada = pideTiming ? "timing" : pideGrasa ? "grasa_anadida" : pideEnfriamiento ? "enfriamiento_tuberculo" : "coccion_tuberculo";
    protocolo.coccion = "Para papa, batata o mandioca, elegí la técnica según el plato y la textura buscada; no asumir enfriamiento previo como recomendación por defecto.";
    if (pideEnfriamiento) protocolo.almidonResistente = "Si el tubérculo se cocina con antelación, enfriá pronto y conservá en heladera; recalentá bien antes de consumir.";
    else delete protocolo.almidonResistente;
  } else if (esCereal) {
    protocolo.familiaDetectada = "cereal";
    protocolo.variableModificada = pideTiming ? "timing" : pideGrasa ? "grasa_anadida" : pideEnfriamiento ? "enfriamiento_cereal" : "coccion_cereal";
    protocolo.coccion = "Ajustá el método y el agua a la variedad de cereal; no asumir enfriamiento previo como recomendación por defecto.";
    if (pideEnfriamiento) protocolo.almidonResistente = "Si el cereal se prepara con antelación, enfriá pronto y conservá en heladera; recalentá bien antes de consumir.";
    else delete protocolo.almidonResistente;
  } else if (!pideEnfriamiento) {
    delete protocolo.almidonResistente;
    protocolo.variableModificada = pideTiming ? "timing" : pideGrasa ? "grasa_anadida" : "coccion";
  } else {
    protocolo.variableModificada = "variable_por_confirmar";
  }

  // Respuesta útil de base: no inventar propiedades del plato, pero tampoco devolver campos vacíos.
  if (!protocolo.coccion) protocolo.coccion = "Elegí una cocción pareja y ajustá el tiempo al alimento, al grosor y a la textura buscada. Evitá quemar la superficie; si es una preparación húmeda, cociná a fuego moderado y revisá el punto antes de agregar más tiempo.";
  if (!protocolo.sinergia) protocolo.sinergia = "Elegí uno o dos condimentos según la base: orégano o albahaca para tomate y pastas; comino y laurel para legumbres; ajo y pimienta para carnes; limón y hierbas para vegetales. Ajustá al gusto, sin tapar el sabor del ingrediente."
  protocolo.gruposDetectados = gruposDetectados.map((grupo) => grupo.clave || grupo.nombre).filter(Boolean);
  if (!protocolo.familiaDetectada) protocolo.familiaDetectada = gruposDetectados[0]?.clave || "familia_general";
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
