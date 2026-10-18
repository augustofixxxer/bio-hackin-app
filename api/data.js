// Alimenta el Explorador con alternativas reutilizables.
import { emitirEventoProducto } from "./_eventos-producto.js";
import { usuarioIdDesdeRequest } from "./_sesion.js";
import { elegirFichaHeladeraIA, PROTOCOLO_CULINARIO_CANONICO } from "./_selector-tips-ia.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function supabaseFetch(path) {
  const faltantes = [];
  if (!SUPABASE_URL) faltantes.push("SUPABASE_URL");
  if (!SUPABASE_KEY) faltantes.push("SUPABASE_SERVICE_ROLE_KEY");
  if (faltantes.length) {
    throw new Error(`Configuración de Supabase incompleta en el entorno: falta ${faltantes.join(", ")}`);
  }
  let resp;
  try {
    const baseUrl = SUPABASE_URL.replace(/\/+$/, "");
    const endpoint = `${baseUrl}/rest/v1/${path}`;
    resp = await fetch(endpoint, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json"
      },
      signal: AbortSignal.timeout(10000)
    });
  } catch (error) {
    throw new Error(`No se pudo conectar con Supabase: ${error?.name === "TimeoutError" ? "timeout de 10 segundos" : (error?.message || "error de red")}`);
  }
  const text = await resp.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; }
  catch { throw new Error(`Supabase respondió HTTP ${resp.status} con un cuerpo no JSON`); }
  if (!resp.ok) {
    const detalle = (data && (data.message || data.error || data.details || data.hint)) || "sin detalle";
    throw new Error(`Supabase/PostgREST HTTP ${resp.status}: ${detalle}`);
  }
  return data;
}


function normalizarBusqueda(texto) {
  return String(texto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
async function validarUsuario(req) {
  const usuarioId = usuarioIdDesdeRequest(req);
  if (!usuarioId) return { ok:false,status:401,error:"Sesión inválida o vencida. Volvé a iniciar sesión." };
  const usuarios = await supabaseFetch(`usuarios?id=eq.${usuarioId}&select=nivel_acceso,premium_until,cuenta_suspendida,terminos_aceptados,objetivo_grupo`);
  if (!usuarios.length) return { ok:false,status:404,error:"Usuario no encontrado." };
  const u = usuarios[0];
  if (u.cuenta_suspendida === true) return { ok:false,status:403,error:"La cuenta está suspendida." };
  if (u.terminos_aceptados !== true) return { ok:false,status:403,error:"Debés aceptar los Términos y Condiciones para continuar." };
  const premiumVigente = u.nivel_acceso === "Premium" && (!u.premium_until || Date.parse(u.premium_until) > Date.now());
  return { ok:true,usuarioId,nivelAcceso:premiumVigente ? "Premium" : "gratuito",objetivoGrupo:u.objetivo_grupo||"salud_general" };
}

const PLAN_FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const PLAN_HORA_REGEX = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
function fechaPlanArgentina() {
  const parts = new Intl.DateTimeFormat("en-CA", {timeZone:"America/Argentina/Buenos_Aires",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  const part = (type) => parts.find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function fechaPlanValida(value) {
  if (typeof value !== "string" || !PLAN_FECHA_REGEX.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10) === value;
}
function normalizarPlanJornada(row, fecha) {
  return {fecha,tipo:row?.tipo==="entreno"?"entreno":"descanso",hora:row?.hora_sesion?String(row.hora_sesion).slice(0,5):"07:00"};
}
async function manejarJornada(req,res,escritura=false) {
  const auth = await validarUsuario(req);
  if (!auth.ok) return res.status(auth.status).json({error:auth.error});
  const perfil = {objetivoGrupo:auth.objetivoGrupo||"salud_general",nivelAcceso:auth.nivelAcceso,premium:auth.nivelAcceso==="Premium"};
  if (!escritura) {
    const solicitada=req.query?.fecha;
    const fecha=fechaPlanValida(solicitada)?solicitada:fechaPlanArgentina();
    const rows=await supabaseFetch(`plan_jornada_diaria?usuario_id=eq.${encodeURIComponent(auth.usuarioId)}&fecha=eq.${encodeURIComponent(fecha)}&select=fecha,tipo,hora_sesion&limit=1`);
    return res.status(200).json({perfil,plan:normalizarPlanJornada(rows?.[0],fecha)});
  }
  const {fecha,tipo,hora}=req.body||{};
  if(!fechaPlanValida(fecha)) return res.status(400).json({error:"La fecha enviada no es válida."});
  if(tipo!=="entreno"&&tipo!=="descanso") return res.status(400).json({error:"El tipo de jornada debe ser entreno o descanso."});
  if(tipo==="entreno"&&!PLAN_HORA_REGEX.test(String(hora||""))) return res.status(400).json({error:"Indicá una hora válida para la sesión."});
  const row={usuario_id:auth.usuarioId,fecha,tipo,hora_sesion:tipo==="entreno"?hora:null,updated_at:new Date().toISOString()};
  const saved=await supabaseFetch("plan_jornada_diaria?on_conflict=usuario_id,fecha",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify(row)});
  return res.status(200).json({ok:true,perfil,plan:normalizarPlanJornada(saved?.[0]||row,fecha)});
}

const SUPERMERCADO_PASILLOS = [
  { key:"supermercado_lacteos_yogures_leches", titulo:"Lácteos", icono:"🥛", opcionesGondola:[{titulo:"Yogur natural firme sin azúcar añadida",detalle:"Revisá que la lista sea breve y compará precio por kilo."},{titulo:"Ricota fresca al peso de fiambrería",detalle:"Pedí el precio por kilo y compará frescura, conservación y uso previsto."},{titulo:"Queso Tybo feteado al peso",detalle:"Una opción de fiambrería para sándwiches o colaciones; compará precio por kilo con el producto envasado."}], familiasAlternativas:["lacteos"], terminosProducto:["yogur natural","yogur firme","leche entera","leche descremada","queso tybo","ricota","kefir"], fallbackGondola:"Yogur natural firme sin sabor añadido", filtroGratis:"Compará la lista: si entre los primeros ingredientes aparecen azúcar, jarabes o almidón modificado, buscá otra opción. Para una comparación simple, mirá yogur natural con leche y fermentos.", ahorroInteligente:"No pagues de más solo por la etiqueta “Light” o “Fit”. Compará el precio por kilo y la lista de ingredientes: el nombre comercial no garantiza una mejor compra ni una diferencia nutricional que justifique el sobreprecio." },
  { key:"supermercado_panificados_harinas", titulo:"Panes y harinas", icono:"🍞", opcionesGondola:[{titulo:"Harina integral 100%",detalle:"Revisá que sea harina integral y compará el precio por kilo."},{titulo:"Pan integral de panadería",detalle:"Preguntá si está elaborado principalmente con harina integral; “multicereal” por sí solo no lo garantiza."},{titulo:"Pan integral envasado con harina integral como primer ingrediente",detalle:"Compará la lista de ingredientes y el precio por kilo entre marcas."}], familiasAlternativas:["panificados"], terminosProducto:["pan integral envasado","pan 100% integral","harina integral","harina de trigo integral"], fallbackGondola:"Harina integral 100% o pan integral envasado cuyo primer ingrediente sea harina integral", filtroGratis:"Dá vuelta el envase: buscá harina integral como primer ingrediente. Si dice “multicereal” pero empieza con harina refinada, no equivale a un pan integral.", ahorroInteligente:"“Multicereal”, “artesanal” y “rústico” pueden funcionar como señales de valor sin garantizar que el producto sea integral. Compará ingredientes y precio por kilo antes de pagar más por el nombre." },
  { key:"supermercado_fideos_arroces_legumbres", titulo:"Pastas, arroz y legumbres", icono:"🌾", opcionesGondola:[{titulo:"Lentejas secas",detalle:"Producto básico de góndola; compará precio por kilo y tiempo de preparación."},{titulo:"Fideos de sémola de trigo candeal",detalle:"Compará precio por kilo entre marcas equivalentes."},{titulo:"Arroz parboiled",detalle:"Una alternativa de góndola fácil de comparar por precio por kilo."}], familiasAlternativas:["pastas","legumbres"], terminosProducto:["fideos de sémola","fideos integrales","arroz integral","arroz parboil","lentejas secas","garbanzos secos","porotos secos"], fallbackGondola:"Fideos de sémola de trigo candeal o arroz parboiled de marca disponible", filtroGratis:"Elegí por el ingrediente principal: sémola de trigo candeal o harina integral en pastas; en legumbres, que el producto sea la legumbre y no una preparación con agregados.", ahorroInteligente:"No confundas el diseño del envase o las promesas “premium” con mayor valor. Compará precio por kilo entre productos equivalentes; en básicos, la marca más cara no siempre cambia el ingrediente principal." },
  { key:"supermercado_embutidos_fiambres", titulo:"Carnes y fiambres", icono:"🥩", opcionesGondola:[{titulo:"Corte de carne fresco del día",detalle:"Consultá el precio por kilo y elegí el corte según el uso y el presupuesto."},{titulo:"Pollo fresco de mostrador",detalle:"Compará precio por kilo y rendimiento para la comida que vas a preparar."},{titulo:"Jamón cocido de fiambrería con lista breve de ingredientes",detalle:"Pedí ver la etiqueta o información del proveedor y compará precio por kilo."}], familiasAlternativas:["carnes"], terminosProducto:["jamón cocido envasado","jamón crudo","bondiola envasada","carne vacuna envasada","pollo envasado"], fallbackGondola:"Corte de carne fresco o fiambre envasado con lista de ingredientes breve", filtroGratis:"En fiambres, compará el porcentaje de carne y la lista de ingredientes. Si aparecen almidones, féculas o muchos agregados, compará con un corte o fiambre de composición más simple.", ahorroInteligente:"El packaging y palabras como “selección” pueden elevar el precio sin que la diferencia sea clara. Compará precio por kilo, porcentaje de carne y merma; no pagues el extra sin identificar qué recibís a cambio." },
  { key:"supermercado_grasas_aceites", titulo:"Aceites y grasas", icono:"🫒", opcionesGondola:[{titulo:"Aceite de girasol",detalle:"Compará precio por litro y elegí según el uso previsto."},{titulo:"Aceite de oliva",detalle:"Si lo preferís para usar en crudo, compará precio por litro y origen declarado."},{titulo:"Aceite de girasol alto oleico",detalle:"Compará el tipo de aceite, el uso previsto y el precio por litro."}], familiasAlternativas:["grasas","aceites"], terminosProducto:["aceite de oliva","aceite de girasol","aceite alto oleico","manteca"], fallbackGondola:"Aceite de oliva o aceite de girasol según el uso y el presupuesto", filtroGratis:"Primero definí el uso: aceite para cocinar o para usar en crudo. Compará el tipo de aceite y evitá elegir solo por frases como “liviano” o “natural”.", ahorroInteligente:"“Premium”, “suave” o “natural” no explican por sí solos el precio. Compará tipo de aceite y precio por litro; elegí por el uso real, no por el halo publicitario del envase." },
  { key:"supermercado_enlatados_salsas", titulo:"Enlatados y salsas", icono:"🥫", opcionesGondola:[{titulo:"Tomate triturado envasado",detalle:"Buscá tomate como ingrediente principal y compará precio por kilo o litro."},{titulo:"Legumbres en lata al natural",detalle:"Revisá si agregan sal y compará el peso escurrido y el precio."},{titulo:"Tomates en conserva",detalle:"Compará ingredientes, peso neto y precio por kilo."}], familiasAlternativas:["conservas","enlatados","salsas"], terminosProducto:["tomate triturado envasado","puré de tomate envasado","tomates en conserva","legumbres en lata"], fallbackGondola:"Tomate triturado envasado con tomate como ingrediente principal", filtroGratis:"En salsa o tomate envasado, mirá el primer ingrediente. Priorizá tomate como ingrediente principal y revisá si agrega azúcar, jarabes o almidones.", ahorroInteligente:"Una etiqueta con imágenes de campo o palabras como “casero” no garantiza una composición superior. Compará ingredientes y precio por kilo o litro entre productos equivalentes antes de pagar el extra." },
  { key:"supermercado_untables_mermeladas", titulo:"Untables y mermeladas", icono:"🍯", opcionesGondola:[{titulo:"Ricota fresca al peso de fiambrería",detalle:"Puede servir como alternativa para untar según la preparación; compará precio por kilo y conservación."},{titulo:"Queso Tybo feteado al peso",detalle:"Opción de fiambrería para un sándwich; compará precio por kilo con quesos untables envasados."},{titulo:"Pasta de maní envasada con maní como ingrediente principal",detalle:"Revisá ingredientes y compará precio por kilo entre envases."}], familiasAlternativas:["untables","mermeladas"], terminosProducto:["queso untable envasado","mermelada envasada","dulce de fruta envasado","pasta de maní envasada"], fallbackGondola:"Queso untable, mermelada o pasta de maní envasada según el uso buscado", filtroGratis:"En mermeladas, revisá qué lugar ocupa la fruta y si hay azúcar o jarabes agregados. En quesos untables, mirá si la lista empieza por queso/leche o por almidones y espesantes.", ahorroInteligente:"“Sin culpa”, “fit” y “natural” son mensajes publicitarios, no una comparación de valor. Revisá ingredientes, tamaño real del envase y precio por kilo antes de pagar más por una promesa." },
  { key:"snacks_bebidas", titulo:"Snacks y bebidas", icono:"🥤", familiasAlternativas:["snacks"], terminosProducto:["frutos secos tostados","almendras tostadas","nueces tostadas","semillas tostadas","semillas de girasol","chocolate 70% cacao","chocolate amargo"], opcionesGondola:[{titulo:"Frutos secos tostados sin sal",detalle:"Elegí una porción que te resulte práctica y compará el precio por kilo entre opciones a granel y envasadas."},{titulo:"Semillas envasadas sin sal agregada",detalle:"Una alternativa simple para sumar a una colación; revisá que el envase no agregue azúcar ni saborizantes."},{titulo:"Chocolate amargo con más de 70% de cacao",detalle:"Compará porcentaje de cacao, ingredientes y precio por kilo: el frente del paquete no alcanza para evaluar el producto."}], fallbackGondola:"Frutos secos tostados sin sal, semillas envasadas o chocolate amargo con 70% o más de cacao", filtroGratis:"Mirá los primeros 2 ingredientes: si hay azúcar, JMAF, aceite vegetal refinado o harina de maíz, compará con otra opción que tenga ingredientes más simples y una porción que te sacie.", traduccionMarketing:"Los snacks de arroz o “saludables” pueden reemplazar grasa por almidón refinado y sodio. El impacto glucémico depende de la fórmula y la porción: compará ingredientes antes de asumir que el frente “Fit” los vuelve mejores.", ahorroInteligente:"Compará precio por kilo y porción entre snacks “Fit”, frutos secos, semillas y chocolate amargo. El empaque puede sumar un sobreprecio que no se traduce automáticamente en más saciedad." }
];
function seccionCurada(texto, encabezado) {
  const parrafos = String(texto || "").split(/\n\s*\n/);
  const objetivo = normalizarBusqueda(encabezado);
  const p = parrafos.find(x => normalizarBusqueda(x).startsWith(objetivo + ":"));
  return p ? p.slice(p.indexOf(":") + 1).trim() : "";
}
function rotacionDelDia(clave, cantidad) {
  if (!cantidad) return 0;
  const fecha = new Date().toLocaleDateString("en-CA", { timeZone:"America/Argentina/Tucuman" });
  const hash = [...String(clave) + fecha].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
  return hash % cantidad;
}
function alternativasParaPasillo(pasillo, alternativas) {
  const familias = new Set(pasillo.familiasAlternativas || []);
  const terminos = (pasillo.terminosProducto || []).map(normalizarBusqueda);
  const noProductoDeGondola = /\b(receta|caser[oa]s? como|plato|preparacion|preparar|acompanamiento|comparar|saciedad|comida|con salsa|al horno|frita|fritas|guiso|bombas|medialunas|canelones|ravioles|bastones|tortillas? de campo|ensalada|licuado|batido|budin|galletas caseras)\b/;
  return alternativas.filter(a => {
    const familia = String(a.familia_key || "");
    if (!familias.has(familia) || ["rehacer","hueco"].includes(a.estado_curado)) return false;
    const titulo = normalizarBusqueda(a.mecanismo || "");
    const recomendacion = normalizarBusqueda(a.recomendacion || "");
    const texto = titulo + " " + recomendacion;
    if (noProductoDeGondola.test(texto)) return false;
    return terminos.some(t => t.length >= 3 && texto.includes(t));
  }).sort((a,b) => (Number(b.prioridad_busqueda)||0) - (Number(a.prioridad_busqueda)||0));
}
function construirBloqueSupermercado(pasillo, regla, alternativas, esPremium) {
  const adaptacion = regla?.soluciones?.adaptacion || "";
  const trampa = seccionCurada(adaptacion, "TRAMPA DE MARKETING");
  const criterio = seccionCurada(adaptacion, "CRITERIO DE ELECCIÓN");
  const evitar = seccionCurada(adaptacion, "OPCIÓN A EVITAR");
  const candidatas = alternativasParaPasillo(pasillo, alternativas);
  const opcionesGondola = pasillo.opcionesGondola || [{titulo:pasillo.fallbackGondola,detalle:"Compará ingredientes, formato y precio por kilo o litro."}];
  const indice = rotacionDelDia(pasillo.key, opcionesGondola.length);
  const seleccionada = opcionesGondola[indice] || opcionesGondola[0];
  const bloque = {
    id:pasillo.key, familiaKey:pasillo.key, titulo:pasillo.titulo, icono:pasillo.icono,
    nivelAcceso:"Premium", filtroGratis:pasillo.filtroGratis, requiereCriterioCurado:false
  };
  if (!esPremium) return bloque;
  const opcionGanadora = {
    titulo:seleccionada.titulo || pasillo.fallbackGondola,
    recomendacion:seleccionada.detalle || "",
    accion:""
  };
  return {
    ...bloque,
    traduccionMarketing:pasillo.traduccionMarketing || trampa,
    criterio,
    evitar,
    opcionGanadora,
    alternativaDisponible:true,
    roi:{ cuantificable:false, mensaje:pasillo.ahorroInteligente },
    accion:regla?.soluciones?.accion_usuario || "",
    observacion:regla?.soluciones?.observacion_usuario || "",
    continuidad:regla?.soluciones?.continuidad || "",
    rotacion:{ fecha:new Date().toLocaleDateString("en-CA",{timeZone:"America/Argentina/Tucuman"}), indice, enfoque:seleccionada.titulo || pasillo.fallbackGondola }
  };
}
function puntuacionCoincidencia(ingredientes, textoFicha) {
  const stop = new Set(["con","para","sin","que","esto","esta","tengo","cocinar","hacer","algo","comida","ingredientes","hoy","una","uno","unos","unas","los","las","del","por","pero","como","desde","quiero","podria","podemos","tiene","tienen"]);
  const tokens = [...new Set(normalizarBusqueda(ingredientes).split(/[^a-z0-9]+/).filter((x)=>x.length>=3&&!stop.has(x)))];
  const ficha = normalizarBusqueda(textoFicha);
  return tokens.reduce((n,token)=>n+(ficha.split(token).length>1?1:0),0);
}
function textoCuradoDeFicha(ficha) {
  return [ficha.recomendacion,ficha.accion_texto,ficha.observacion_texto,ficha.continuidad_texto,
    ficha.descripcion_mecanismo,ficha.resultado,ficha.solucion?.adaptacion,ficha.solucion?.accion_usuario,
    ficha.solucion?.observacion_usuario,ficha.solucion?.continuidad]
    .filter((x)=>typeof x==="string"&&x.trim()).join("\n");
}
function extraerDatoCurado(texto, patron) {
  return String(texto||"").split(/\r?\n/).filter(Boolean).find((linea)=>patron.test(linea))||null;
}
async function consultarHeladera(req,res) {
  const auth = await validarUsuario(req);
  if(!auth.ok)return res.status(auth.status).json({error:auth.error});
  const ingredientes = typeof req.body?.ingredientes==="string"?req.body.ingredientes.trim():"";
  if(!ingredientes||ingredientes.length>600)return res.status(400).json({error:"Escribí los ingredientes (hasta 600 caracteres)."});
  try {
    const [alternativas,reglas]=await Promise.all([
      supabaseFetch("alternativas_locales?select=id,mecanismo,descripcion_mecanismo,recomendacion,accion_texto,observacion_texto,continuidad_texto,familia_key,tipo,estado_curado"),
      supabaseFetch("reglas?select=id,combinacion,resultado,palabras_clave,nivel_acceso,familia_key,momento_requerido,soluciones(id,nombre_hackeo,adaptacion,accion_usuario,observacion_usuario,continuidad)")
    ]);
    const candidatas=[
      ...alternativas.filter((a)=>!["rehacer","hueco"].includes(a.estado_curado)).map((a)=>({
        clave:`alternativa:${a.id}`,origen:"alternativas_locales",id:a.id,titulo:a.mecanismo||"Ficha de cocina",
        recomendacion:a.recomendacion||"",descripcion_mecanismo:a.descripcion_mecanismo||"",accion_texto:a.accion_texto||"",
        observacion_texto:a.observacion_texto||"",continuidad_texto:a.continuidad_texto||"",familia_key:a.familia_key||null,
        resumen:[a.mecanismo,a.descripcion_mecanismo,a.recomendacion,a.accion_texto].filter(Boolean).join(" — ")
      })),
      ...reglas.filter((r)=>(auth.nivelAcceso==="Premium"||r.nivel_acceso!=="Premium")&&
        !String(r.combinacion||"").startsWith("Supermercado: ")&&
        !String(r.familia_key||"").startsWith("supermercado_")&&
        r.momento_requerido!=="Durante la compra en supermercado"&&r.soluciones?.id).map((r)=>({
        clave:`regla:${r.id}`,origen:"reglas",id:r.id,titulo:r.combinacion||r.soluciones?.nombre_hackeo||"Regla de cocina",
        resultado:r.resultado||"",recomendacion:r.soluciones?.adaptacion||"",accion_texto:r.soluciones?.accion_usuario||"",
        observacion_texto:r.soluciones?.observacion_usuario||"",continuidad_texto:r.soluciones?.continuidad||"",
        familia_key:r.familia_key||null,solucion:r.soluciones||null,
        resumen:[r.combinacion,r.resultado,r.soluciones?.adaptacion,r.soluciones?.accion_usuario].filter(Boolean).join(" — ")
      }))
    ];
    const shortlist=candidatas.map((f)=>({...f,puntuacion:puntuacionCoincidencia(ingredientes,[f.titulo,f.resumen,f.familia_key].filter(Boolean).join(" "))}))
      .filter((f)=>f.puntuacion>0).sort((a,b)=>b.puntuacion-a.puntuacion).slice(0,40);
    if(!shortlist.length)return res.status(200).json({ok:true,encontrada:false,origen:"sin_coincidencia",mensaje:"No encontramos una ficha curada con coincidencia suficiente. Probá describiendo los ingredientes con otros nombres; no vamos a inventar una receta."});
    const elegido=await elegirFichaHeladeraIA(ingredientes,shortlist.map((f)=>({id:f.clave,mecanismo:`${f.titulo}: ${f.resumen}`})));
    if(!elegido)return res.status(200).json({ok:true,encontrada:false,origen:"degradacion_segura",mensaje:"El asistente de IA no está disponible o no encontró una ficha suficientemente clara. Podés probar otra descripción; no se inventó una receta."});
    const ficha=shortlist.find((f)=>f.clave===elegido);
    if(!ficha)return res.status(200).json({ok:true,encontrada:false,origen:"degradacion_segura",mensaje:"No pudimos validar la ficha seleccionada."});
    return res.status(200).json({ok:true,encontrada:true,propuesta:{
      id:ficha.id,origen:ficha.origen,titulo:ficha.titulo,recomendacion:ficha.recomendacion||ficha.resultado||"",
      accion:ficha.accion_texto||"",observacion:ficha.observacion_texto||"",continuidad:ficha.continuidad_texto||"",
      estructuraMetodo:{
        coccion:PROTOCOLO_CULINARIO_CANONICO.coccion,
        condimentos:PROTOCOLO_CULINARIO_CANONICO.condimentos,
        fibra:PROTOCOLO_CULINARIO_CANONICO.fibra,
        ordenFibra:PROTOCOLO_CULINARIO_CANONICO.fibra,
        almidonResistente:PROTOCOLO_CULINARIO_CANONICO.almidonResistente,
        nota:"Protocolo culinario canónico de Reseteo Propio. Las condiciones se aplican según los ingredientes; la ficha seleccionada sigue siendo contenido curado y Groq no redacta ni inventa recetas."
      }
    }});
  } catch(err) {
    console.error("[heladera] consulta no bloqueante:",err);
    return res.status(200).json({ok:true,encontrada:false,origen:"degradacion_segura",mensaje:"No pudimos consultar las fichas ahora. Probá de nuevo más tarde; el asistente no inventó una receta."});
  }
}

const INTENT_BRIDGE = {
  energia: "El cansancio puede estar relacionado con varias cosas —descanso, actividad, hidratación o alimentación—. Acá podés probar una opción de comida y una de movimiento para descubrir qué te cambia.",
  descanso_sueno: "Dormir mal puede estar relacionado con más de un factor. Acá podés probar una opción de alimentación y otra de actividad para ver qué cambia en tus noches.",
  digestion: "La pesadez o la hinchazón pueden aparecer por distintas razones. Acá podés probar un cambio en la comida y otro en el movimiento y comparar cómo te sentís.",
  foco_concentracion: "Cuando cuesta sostener la atención, una comida o una pausa activa pueden ser puntos de partida. Acá podés probar una opción de cada lado y comparar.",
  hambre_saciedad: "Llegar con hambre demasiado pronto puede depender de cómo fue la comida y de lo que hacés después. Acá podés probar una opción de alimentación y otra de movimiento.",
  entrenamiento: "Cómo llegás a entrenar puede cambiar según lo que comés y lo que hacés antes. Acá podés probar una opción de comida y otra de actividad.",
  recuperacion: "Después de entrenar, lo que comés y lo que hacés después pueden cambiar cómo transcurren las horas siguientes. Acá podés probar una opción de cada lado y comparar.",
};


async function manejarCatalogoNutricional(req, res) {
  const auth = await validarUsuario(req);
  if (!auth.ok) {
    console.warn("[catalogo-alimentos] Sesión rechazada:", auth.status, auth.error);
    return res.status(auth.status).json({ error: auth.error });
  }

  // Mi Día necesita la identidad y clasificación de los alimentos para generar
  // alternativas. No debe depender de tres lecturas adicionales de composición,
  // nutrientes y fuentes que no utiliza esta vista.
  console.info("[catalogo-alimentos] Sesión validada; consultando alimentos validados.");
  const alimentos = await supabaseFetch(
    "motor_nutricional_alimentos?select=id,descripcion_fuente,preparacion,estado,base_comestible&estado=eq.validado&order=descripcion_fuente.asc&limit=500"
  );
  if (!Array.isArray(alimentos)) {
    throw new Error("Supabase/PostgREST devolvió un formato inesperado para el catálogo de alimentos.");
  }
  console.info(`[catalogo-alimentos] Consulta completada: ${alimentos.length} alimentos validados.`);
  const resultado = alimentos.map((a) => ({
    id: a.id,
    nombre: a.descripcion_fuente,
    preparacion: a.preparacion || null,
    baseComestible: a.base_comestible,
    estado: a.estado,
    // Se conserva la forma del contrato. Mi Día no calcula nutrientes.
    fuente: null,
    nutrientes: {}
  }));
  if (!resultado.length) {
    console.error("[catalogo-alimentos] La consulta respondió correctamente, pero no devolvió alimentos validados.");
  }
  res.setHeader("Cache-Control", "private, max-age=60, stale-while-revalidate=120");
  return res.status(200).json({ ok: true, alimentos: resultado, actualizado: new Date().toISOString() });
}

export default async function handler(req, res) {
  if (req.method === "POST" && req.body?.accion === "heladera") {
    await consultarHeladera(req, res);
    return;
  }
  // Jornada diaria comparte esta función serverless para respetar el límite de Vercel Hobby.
  if (req.method === "POST" && req.body?.accion === "jornada") {
    try { await manejarJornada(req,res,true); }
    catch (error) { res.status(500).json({error:"No pudimos guardar tu jornada. Verificá que plan_jornada_diaria esté disponible."}); }
    return;
  }
  if (req.method === "POST") {
    const { evento, contexto, metadata } = req.body || {};
    await emitirEventoProducto({ usuarioId: usuarioIdDesdeRequest(req), evento, contexto, metadata });
    res.status(200).json({ ok: true });
    return;
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) { res.status(500).json({ error: "Falta configurar Supabase." }); return; }
  try {
    if (req.query?.vista === "catalogo-alimentos") {
      try { await manejarCatalogoNutricional(req,res); }
      catch (error) {
        console.error("[catalogo-alimentos] Falló la consulta autenticada:", error?.message || error);
        return res.status(500).json({error:"No pudimos cargar el catálogo nutricional."});
      }
      return;
    }
    if (req.query?.vista === "jornada") {
      try { await manejarJornada(req,res,false); }
      catch (error) { return res.status(500).json({error:"No pudimos cargar tu jornada. Verificá que plan_jornada_diaria esté disponible."}); }
      return;
    }
    if (req.query?.vista === "supermercado") {
      const auth = await validarUsuario(req);
      if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
      const [reglasSuper, alternativas] = await Promise.all([
        supabaseFetch("reglas?select=id,combinacion,resultado,nivel_acceso,momento_requerido,familia_key,soluciones(id,nombre_hackeo,adaptacion,accion_usuario,observacion_usuario,continuidad)&momento_requerido=eq.Durante%20la%20compra%20en%20supermercado"),
        supabaseFetch("alternativas_locales?select=id,mecanismo,descripcion_mecanismo,recomendacion,accion_texto,observacion_texto,continuidad_texto,familia_key,estado_curado,prioridad_busqueda")
      ]);
      const reglasPorFamilia = new Map(reglasSuper.map(r => [r.familia_key, r]));
      const esPremium = auth.nivelAcceso === "Premium";
      const bloques = SUPERMERCADO_PASILLOS.map(p => construirBloqueSupermercado(p, reglasPorFamilia.get(p.key), alternativas, esPremium));
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json({ ok:true, requierePremium:!esPremium, bloques });
    }
    const alternativas = await supabaseFetch(`alternativas_locales?select=id,mecanismo,descripcion_mecanismo,recomendacion,frecuencia_dosis,compuesto_activo,tipo,objetivo,nivel_evidencia,tipo_card,badge_principal,tag_frio_calor,orden_prioridad,intencion_principal_id,intenciones_secundarias,familia_key,prioridad_busqueda,estado_curado,accion_texto,observacion_texto,continuidad_texto`);
    const intenciones = await supabaseFetch(`intenciones?select=id,clave`);
    const claveDeIntencion = Object.fromEntries(intenciones.map(i => [i.id, i.clave]));
    const entradas = alternativas.map(a => ({
      id:a.id,tipo:a.tipo === "Protocolo" ? "protocolo" : "alternativa",combinacion:a.mecanismo||"",resultado:a.recomendacion||"",mecanismo:a.descripcion_mecanismo||null,
      frecuencia:a.frecuencia_dosis||null,nutriente:a.compuesto_activo||null,categorias:a.objetivo||[],evidencia:a.nivel_evidencia||null,tipo_card:a.tipo_card||null,badge_principal:a.badge_principal||null,tag_frio_calor:a.tag_frio_calor||null,orden_prioridad:a.orden_prioridad??null,
      intencionPrincipal:claveDeIntencion[a.intencion_principal_id]||null,intencionesSecundarias:(a.intenciones_secundarias||[]).map(id=>claveDeIntencion[id]).filter(Boolean),familia:a.familia_key||null,prioridadBusqueda:a.prioridad_busqueda||0,estadoCurado:a.estado_curado||null,accionTexto:a.accion_texto||null,observacionTexto:a.observacion_texto||null,continuidadTexto:a.continuidad_texto||null
    }));
    // Para las píldoras: exactamente dos propuestas por situación, una de alimentación y una de actividad.
    // No se toca el catálogo completo; solo se reduce la superficie que ve el usuario en esta entrada.
    const byIntent = {};
    for (const e of entradas) {
      if (!byIntent[e.intencionPrincipal]) byIntent[e.intencionPrincipal] = [];
      byIntent[e.intencionPrincipal].push(e);
    }
    for (const [intent, list] of Object.entries(byIntent)) {
      const score = e => (Number(e.prioridadBusqueda)||0) + (e.estadoCurado === "conservar" ? 2 : 0);
      const food = list.filter(e=>e.tipo!=="protocolo").sort((a,b)=>score(b)-score(a))[0];
      const activity = list.filter(e=>e.tipo==="protocolo").sort((a,b)=>score(b)-score(a))[0];
      const selected = [food,activity].filter(Boolean);
      if (selected.length) {
        const bridge = INTENT_BRIDGE[intent];
        if (bridge) selected[0] = {...selected[0], combinacion: bridge};
      }
      byIntent[intent] = selected;
    }
    const entradasPildoras = Object.values(byIntent).flat();
    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=300");
    res.status(200).json({ entradas: entradasPildoras, actualizado:new Date().toISOString() });
  } catch(err) { res.status(500).json({ error:"Error consultando Supabase", detail:String(err) }); }
}
// END: /api/data.js
