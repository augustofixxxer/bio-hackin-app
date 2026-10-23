// api/_selector-tips-ia.js
// Selectores deterministas. El catálogo editorial de platos vive en _catalogo-platos.js.
// Este archivo conserva el protocolo culinario existente y una selección conservadora
// para el asistente de heladera; no realiza llamadas a proveedores de IA.

// Selección de fichas del catálogo maestro: determinista y sin proveedor de IA.

/**
 * @param {string} texto - el texto de la comida que escribió el usuario
 * @param {Array<{id: string, mecanismo: string}>} fichas - candidatas reales de Supabase
 * @returns {Promise<string|null>} el id elegido, o null (sin IA / sin relación clara / error)
 */
async function elegirTipRelevanteIA() {
  // Compatibilidad temporal con llamadas antiguas: las fichas libres ya no se seleccionan
  // por matching genérico. El flujo principal usa resolverFichaPlato y el catálogo maestro.
  return null;
}

const PROTOCOLO_CULINARIO_CANONICO = {
  coccion: "Priorizar cocción a fuego lento en cacerola/sartén tipo Essen con tapa, reteniendo humedad, o sellado en plancha/sartén de hierro. Como materia grasa para cocinar a temperatura media/baja: manteca real, grasa vacuna (cebo) o aceite de oliva virgen extra. Evitar aceites de semilla refinados.",
  condimentos: "Si el plato incluye cúrcuma, combinarla con una pizca de pimienta negra recién molida y una base grasa. Incorporar jengibre fresco o en polvo, comino, orégano, tomillo o laurel según el ingrediente base.",
  fibra: "Si la preparación contiene almidones (arroz, papas, fideos) u otros carbohidratos, iniciar la ingesta con una porción de fibra o vegetales verdes/crujientes.",
  almidonResistente: "Si el usuario consulta por almidón resistente o preparación anticipada de arroz, papa o legumbres: enfriar rápidamente, refrigerar dentro de 1–2 horas y, tras 12–24 horas, recalentar bien. El enfriado puede aumentar el almidón resistente, pero el efecto glucémico varía; no presentarlo como obligación ni prometer una reducción fija."
};

function normalizarProtocolo(texto) {
  return String(texto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Construye solo los apartados que justifican los ingredientes descritos.
// No genera una receta ni altera la ficha curada que ya devuelve el motor.

function resolverPlatoCompuestoArgentino(t) {
  const has = (re) => re.test(t);
  const milanesa = has(/\b(milanesa|milanesas)\b/);
  const guarniciones = [
    {id:"pure", re:/\b(pure|pure de papa)\b/, nombre:"puré", hack:"Serví una porción definida. Como prueba, enfriá la papa cocida en heladera y recalentala bien antes de hacer el puré: puede aumentar el almidón resistente."},
    {id:"papas_fritas", re:/\b(papas fritas|papas al horno|papas doradas|papas noisette)\b/, nombre:"papas", hack:"Si querés reducir la grasa añadida, probá papas al horno en una porción similar; el almidón sigue presente."},
    {id:"arroz", re:/\b(arroz|arroz blanco|arroz integral)\b/, nombre:"arroz", hack:"Definí la porción y sumá vegetales. Si lo preparás antes, enfriá rápido, refrigerá dentro de 1–2 horas y recalentá bien: puede aumentar el almidón resistente."},
    {id:"pasta", re:/\b(fideos|pasta|tallarines|espaguetis|noquis|ñoquis|ravioles|canelones|sorrentinos)\b/, nombre:"pasta", hack:"Cociná la pasta al dente y mantené la porción; el rebozado también suma carbohidratos."},
    {id:"ensalada", re:/\b(ensalada|lechuga|rucula|tomate|verduras|vegetales|brocoli|zanahoria)\b/, nombre:"vegetales", hack:"Sumá una porción real de vegetales y, si te resulta cómodo, empezá por ellos."}
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
      resumenIntegrado:principal+" La guarnición de "+guarnicion.nombre+" también aporta almidón; el plato suma ambos.",
      hackIntegrado:(frita?"Probá la milanesa al horno y mantené igual la guarnición para comparar. ":"Mantené la milanesa como te gusta y ajustá la guarnición. ")+guarnicion.hack,
      queObservar:"Observá saciedad y energía después de comer. Cambiá una sola variable por vez.",
      coccion:"Milanesa "+coccion+" con "+guarnicion.nombre+".",
      sinergia:""+guarnicion.hack,
      timingOrden:"Si el plato incluye vegetales, podés empezar por ellos y después seguir con la milanesa y "+guarnicion.nombre+"; es opcional.",
      variableModificada:"plato_compuesto_milanesa_"+guarnicion.id
    };
  }

  const pasta = has(/\b(fideos|pasta|tallarines|espaguetis|noquis|ñoquis|ravioles|canelones|sorrentinos)\b/);
  const salsas = [
    {re:/\b(bolognesa|boloñesa|bolonesa|tuco|salsa de carne)\b/,nombre:"salsa con carne",hack:"Cociná la pasta al dente; la salsa suma proteína, pero no elimina el almidón."},
    {re:/\b(salsa blanca|crema|cremosa)\b/,nombre:"salsa cremosa",hack:"Mantené la salsa, medí la porción y sumá vegetales en la salsa o al costado."},
    {re:/\b(pesto)\b/,nombre:"pesto",hack:"Usá el pesto justo para cubrir la pasta, cocinala al dente y sumá vegetales."},
    {re:/\b(tomate|tuco|fileto|pomodoro|salsa roja)\b/,nombre:"salsa de tomate",hack:"Sumá cebolla, zucchini o berenjena a la salsa y cociná la pasta al dente."}
  ].find(s=>s.re.test(t));
  if (pasta && salsas) {
    const acomp = has(/\b(ensalada|verduras|vegetales|pollo|carne|albondigas|albóndigas|milanesa)\b/);
    return {
      familiaDetectada:"pasta + "+salsas.nombre.replace(/\s+/g,"_"),
      gruposDetectados:["plato_compuesto_argentino","pasta","salsa"],
      componentesDetectados:["pasta",salsas.nombre],
      resumenIntegrado:"La pasta aporta almidón; la salsa de "+salsas.nombre+" completa el plato.",
      hackIntegrado:"Cociná la pasta al dente. "+salsas.hack,
      queObservar:"Observá saciedad, energía y digestión. En la próxima prueba, cambiá solo una variable.",
      coccion:"Pasta al dente con "+salsas.nombre+".",
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
      resumenIntegrado:"La masa aporta harina y el relleno de "+relleno+" define el aporte de proteína, fibra y grasa.",
      hackIntegrado:"Mantené el relleno y sumá vegetales o ensalada. No hace falta quitar la masa.",
      queObservar:"Observá saciedad y digestión. En otra comida, compará con y sin vegetales.",
      coccion:"Tarta de "+relleno+(ensalada ? " con ensalada." : "."),
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
    const patron = clave.split(/\s+/).map((parte) => parte.replace(/[.*+?^|]/g, "\\$&")).join("\s+");
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
  const texto = normalizarProtocolo(ingredientes).replace(/[^a-z0-9ñ\s-]/g, " ").replace(/\s+/g, " ").trim();
  if (!texto || !Array.isArray(fichas) || fichas.length === 0) return null;
  const ignoradas = new Set(["para","con","sin","del","las","los","una","uno","que","como","esto","esta","este","tengo","hay","usar"]);
  const tokens = [...new Set(texto.split(/[^a-z0-9ñ]+/).filter(t => t.length >= 4 && !ignoradas.has(t)))];
  if (!tokens.length) return null;
  let mejor = null;
  let mejorPuntaje = 0;
  for (const ficha of fichas) {
    const textoFicha = normalizarProtocolo([
      ficha.mecanismo, ficha.descripcion_mecanismo, ficha.recomendacion
    ].filter(Boolean).join(" ")).replace(/[^a-z0-9ñ\s-]/g, " ").replace(/\s+/g, " ").trim();
    const coincidencias = tokens.filter(token => (" " + textoFicha + " ").includes(" " + token + " ")).length;
    // Criterio conservador: exige al menos dos términos distintivos para evitar
    // falsos positivos por ingredientes genéricos compartidos.
    if (coincidencias >= 2 && coincidencias > mejorPuntaje) {
      mejor = ficha.id;
      mejorPuntaje = coincidencias;
    }
  }
  return mejor;
}

export { elegirTipRelevanteIA, elegirFichaHeladeraIA, PROTOCOLO_CULINARIO_CANONICO, construirProtocoloCulinarioAdaptativo };
// END: /api/_selector-tips-ia.js
