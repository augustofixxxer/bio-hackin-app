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
  // Un plato compuesto no debe resolverse con una ficha aislada por ingrediente.
  // Su recomendación integrada se construye en construirProtocoloCulinarioAdaptativo.
  const textoNormalizado = normalizarProtocolo(texto).replace(/[^a-z0-9ñ\s-]/g, " ").replace(/\s+/g, " ").trim();
  if (resolverPlatoCompuestoArgentino(textoNormalizado)) return null;

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

function resolverPlatoCompuestoArgentino(t) {
  const has = (re) => re.test(t);
  const milanesa = has(/\b(milanesa|milanesas)\b/);
  const guarniciones = [
    {id:"pure", re:/\b(pure|pure de papa)\b/, nombre:"puré", hack:"Si es puré, podés prepararlo con papa hervida y porción definida. Como experimento, compará otra vez con papa cocida, enfriada rápidamente en heladera y recalentada bien antes de triturar; no es obligatorio ni garantiza una respuesta glucémica menor."},
    {id:"papas_fritas", re:/\b(papas fritas|papas al horno|papas doradas|papas noisette)\b/, nombre:"papas", hack:"Mantené una porción decidida. Para cambiar una variable, compará papas fritas con papas al horno y conservá similar la cantidad; el horno puede reducir la grasa añadida, pero no elimina el almidón."},
    {id:"arroz", re:/\b(arroz|arroz blanco|arroz integral)\b/, nombre:"arroz", hack:"Serví una porción definida y sumá vegetales. Si preparás el arroz con antelación, enfriá rápido, refrigerá dentro de 1–2 horas y recalentá bien: puede aumentar el almidón resistente, con efecto variable."},
    {id:"pasta", re:/\b(fideos|pasta|tallarines|espaguetis|noquis|ñoquis|ravioles|canelones|sorrentinos)\b/, nombre:"pasta", hack:"Cociná la pasta al dente y mantené estable la porción. La milanesa suma proteína y, si tiene rebozado, carbohidratos también: ninguno de los componentes anula al otro."},
    {id:"ensalada", re:/\b(ensalada|lechuga|rucula|tomate|verduras|vegetales|brocoli|zanahoria)\b/, nombre:"vegetales", hack:"Incluí los vegetales como parte real de la comida. Si te resulta cómodo, empezá por ellos y después seguí con la milanesa y la guarnición; es una prueba opcional, no una garantía glucémica."}
  ];
  const guarnicion = guarniciones.find(g => g.re.test(t));
  if (milanesa && guarnicion) {
    const frita = has(/\b(frita|fritas|frito|fritos)\b/);
    const horno = has(/\b(al horno|horno|air fryer|freidora de aire)\b/);
    const coccion = frita ? "frita" : horno ? "al horno/aire" : "de cocción no especificada";
    const napo = has(/\b(napolitana|napolitanas)\b/);
    const principal = napo ? "La milanesa napolitana suma rebozado, tomate y queso." : "La milanesa aporta proteína y, si lleva rebozado, también carbohidratos.";
    return {
      familiaDetectada:"milanesa + " + guarnicion.id,
      gruposDetectados:["plato_compuesto_argentino","milanesa",guarnicion.id],
      componentesDetectados:["milanesa ("+coccion+")",guarnicion.nombre],
      resumenIntegrado:principal+" La guarnición de "+guarnicion.nombre+" aporta su propio perfil: hay que considerar los dos componentes.",
      hackIntegrado:"COMBO INTEGRADO: "+(frita?"si querés comparar la cocción, probá milanesa al horno manteniendo la misma guarnición y una porción parecida.":"conservá la preparación de la milanesa y cambiá una sola variable de la guarnición.")+" "+guarnicion.hack,
      queObservar:"Compará saciedad, energía y comodidad digestiva. Cambiá una sola variable por vez; si medís glucosa, contrastá porciones y condiciones similares. Ningún cambio garantiza el mismo efecto en todas las personas.",
      coccion:"PLATO COMPUESTO: milanesa "+coccion+" + "+guarnicion.nombre+". "+principal+" La recomendación incluye ambos componentes.",
      sinergia:"HACK INTEGRADO: "+guarnicion.hack,
      timingOrden:"Si el plato incluye vegetales, podés empezar por ellos y después seguir con la milanesa y "+guarnicion.nombre+"; es opcional.",
      variableModificada:"plato_compuesto_milanesa_"+guarnicion.id
    };
  }

  const pasta = has(/\b(fideos|pasta|tallarines|espaguetis|noquis|ñoquis|ravioles|canelones|sorrentinos)\b/);
  const salsas = [
    {re:/\b(bolognesa|boloñesa|bolonesa|tuco|salsa de carne)\b/,nombre:"salsa con carne",hack:"La salsa ya suma proteína; incorporá vegetales si te gustan y cociná la pasta al dente. La proteína no anula el almidón de la pasta."},
    {re:/\b(salsa blanca|crema|cremosa)\b/,nombre:"salsa cremosa",hack:"Conservá la salsa que disfrutás, definí la porción y sumá vegetales en la salsa o al costado. No hace falta eliminarla para ajustar la composición del plato."},
    {re:/\b(pesto)\b/,nombre:"pesto",hack:"El pesto concentra sabor y grasa: usá la cantidad que cubra la pasta y sumá vegetales. Cociná la pasta al dente y mantené estable la porción para comparar."},
    {re:/\b(tomate|tuco|fileto|pomodoro|salsa roja)\b/,nombre:"salsa de tomate",hack:"Podés enriquecer la salsa con cebolla, zucchini, berenjena u otros vegetales. Cociná la pasta al dente y mantené estable la porción para comparar."}
  ].find(s=>s.re.test(t));
  if (pasta && salsas) {
    const acomp = has(/\b(ensalada|verduras|vegetales|pollo|carne|albondigas|albóndigas|milanesa)\b/);
    return {
      familiaDetectada:"pasta + "+salsas.nombre.replace(/\s+/g,"_"),
      gruposDetectados:["plato_compuesto_argentino","pasta","salsa"],
      componentesDetectados:["pasta",salsas.nombre],
      resumenIntegrado:"La pasta aporta almidón y la salsa ("+salsas.nombre+") modifica la composición del plato. "+(acomp?"El acompañamiento/proteína también cuenta como parte del conjunto.":"No se asume un acompañamiento que no fue mencionado."),
      hackIntegrado:"COMBO INTEGRADO: cociná la pasta al dente y aplicá este ajuste a la salsa: "+salsas.hack,
      queObservar:"Compará saciedad, energía, disfrute y comodidad digestiva con una porción similar. Cambiá solo el punto de cocción o la composición de la salsa en cada prueba.",
      coccion:"PLATO COMPUESTO: pasta al dente + "+salsas.nombre+". Ajustá la cocción y la salsa como partes de una misma comida.",
      sinergia:salsas.hack,
      timingOrden:acomp?"Si hay vegetales, podés empezar por ellos y seguir con la pasta y su salsa; no es obligatorio.":"No se indicó una guarnición vegetal; no la damos por presente.",
      variableModificada:"plato_compuesto_pasta_salsa"
    };
  }

  const tarta = has(/\b(tarta|tartas)\b/);
  const relleno = has(/\b(pollo)\b/) ? "pollo" : has(/\b(choclo)\b/) ? "choclo" : has(/\b(jamon|queso)\b/) ? "jamón y queso" : has(/\b(acelga|espinaca|verdura|verduras|zapallito)\b/) ? "verduras" : null;
  if (tarta && relleno) {
    const ensalada = has(/\b(ensalada|lechuga|rucula|tomate|vegetales)\b/);
    return {
      familiaDetectada:"tarta + "+(ensalada?"ensalada":"relleno"),
      gruposDetectados:["plato_compuesto_argentino","tarta","relleno"],
      componentesDetectados:["masa de tarta","relleno de "+relleno,...(ensalada?["ensalada/vegetales"]:[])],
      resumenIntegrado:"La masa aporta harina y el relleno de "+relleno+" define parte de la proteína, fibra y grasa. "+(ensalada?"La ensalada también forma parte del plato.":"No se informó una guarnición adicional."),
      hackIntegrado:"COMBO INTEGRADO: mantené el relleno que te gusta y sumá una porción visible de vegetales; "+(ensalada?"podés empezar por la ensalada si te resulta cómodo.":"si querés completar el plato, acompañá la tarta con ensalada o vegetales.")+" No hace falta retirar toda la masa.",
      queObservar:"Compará saciedad, energía y comodidad digestiva. En otra prueba cambiá solo la guarnición o la proporción de vegetales.",
      coccion:"PLATO COMPUESTO: masa + relleno de "+relleno+(ensalada ? " + ensalada/vegetales." : ".")+" La recomendación considera la tarta completa.",
      sinergia:"Priorizá que el relleno tenga una proporción clara de su ingrediente principal y, si elegís ensalada, que sea una guarnición real.",
      timingOrden:ensalada?"Podés empezar por la ensalada y después comer la tarta; es una prueba opcional.":"No se informó ensalada; no se asume que esté presente.",
      variableModificada:"plato_compuesto_tarta"
    };
  }
  return null;
}

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
  // Prioridad máxima: si el usuario escribió un plato compuesto, la salida debe cruzar sus componentes.
  const protocoloCompuesto = resolverPlatoCompuestoArgentino(t);
  if (protocoloCompuesto) Object.assign(protocolo, protocoloCompuesto);

  if (!protocolo.coccion) protocolo.coccion = "Elegí una cocción pareja y ajustá el tiempo al alimento, al grosor y a la textura buscada. Evitá quemar la superficie; si es una preparación húmeda, cociná a fuego moderado y revisá el punto antes de agregar más tiempo.";
  if (!protocolo.sinergia) protocolo.sinergia = "Elegí uno o dos condimentos según la base: orégano o albahaca para tomate y pastas; comino y laurel para legumbres; ajo y pimienta para carnes; limón y hierbas para vegetales. Ajustá al gusto, sin tapar el sabor del ingrediente."
  if (!protocoloCompuesto) protocolo.gruposDetectados = gruposDetectados.map((grupo) => grupo.clave || grupo.nombre).filter(Boolean);
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
