// Alimenta el Explorador con alternativas reutilizables.
import { emitirEventoProducto } from "./_eventos-producto.js";
import { usuarioIdDesdeRequest } from "./_sesion.js";
import { elegirFichaHeladeraIA, PROTOCOLO_CULINARIO_CANONICO } from "./_selector-tips-ia.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function supabaseFetch(path) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" } });
  const text = await resp.text();
  const data = text ? JSON.parse(text) : null;
  if (!resp.ok) throw new Error((data && (data.message || data.error)) || `Supabase respondió ${resp.status}`);
  return data;
}


function normalizarBusqueda(texto) {
  return String(texto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
async function validarUsuario(req) {
  const usuarioId = usuarioIdDesdeRequest(req);
  if (!usuarioId) return { ok:false,status:401,error:"Sesión inválida o vencida. Volvé a iniciar sesión." };
  const usuarios = await supabaseFetch(`usuarios?id=eq.${usuarioId}&select=nivel_acceso,premium_until,cuenta_suspendida,terminos_aceptados`);
  if (!usuarios.length) return { ok:false,status:404,error:"Usuario no encontrado." };
  const u = usuarios[0];
  if (u.cuenta_suspendida === true) return { ok:false,status:403,error:"La cuenta está suspendida." };
  if (u.terminos_aceptados !== true) return { ok:false,status:403,error:"Debés aceptar los Términos y Condiciones para continuar." };
  const premiumVigente = u.nivel_acceso === "Premium" && (!u.premium_until || Date.parse(u.premium_until) > Date.now());
  return { ok:true,usuarioId,nivelAcceso:premiumVigente ? "Premium" : "gratuito" };
}
function parsearBloqueSupermercado(regla) {
  const lineas = String(regla.resultado || "").split(/\r?\n/);
  const campo = (prefijo) => {
    const linea = lineas.find((x) => x.toLowerCase().startsWith(prefijo.toLowerCase()));
    return linea ? linea.slice(linea.indexOf(":") + 1).trim() : "";
  };
  const titulo=String(regla.combinacion||"").replace(/^Supermercado:\s*/,"");
  const bloque={
    id:regla.id,titulo,
    trampa:campo("TRAMPA DE MARKETING"),criterio:campo("CRITERIO"),evitar:campo("EVITAR"),elegir:campo("ELEGIR"),
    nivelAcceso:regla.nivel_acceso,momento:regla.momento_requerido
  };
  const nombre=normalizarBusqueda(titulo);
  if(/fiambres|embutidos/.test(nombre)){
    bloque.trampa="Algunos fiambres se venden como si fueran un corte de carne, pero son una pasta de recortes procesados con agua, almidón o harina y aditivos.";
    bloque.criterio="Buscá fibras o vetas visibles de carne curada. Si el interior es liso, uniforme y gomoso, probablemente sea un producto más reconstituido.";
    bloque.evitar="Salchichas, paleta sanguchera económica y fiambres picados de textura gomosa.";
    bloque.elegir="Jamón cocido de primera marca elaborado con pata real, jamón crudo o bondiola.";
  }
  if(/fideos|arroz|legumbres secas/.test(nombre)){
    bloque.trampa="El envase puede destacar palabras como “integral” o “natural” sin explicar cómo está procesado el producto.";
    bloque.criterio="Por qué importa: el trigo candeal suele conservar mejor la estructura del almidón durante la cocción; el arroz parboiled recibe un tratamiento previo que modifica el almidón. Ambos pueden reducir la respuesta glucémica frente a algunas alternativas, según variedad, cocción y porción.";
    bloque.evitar="No elijas solo por el frente del paquete ni te guíes únicamente por el color.";
    bloque.elegir="Para fideos, priorizá sémola de trigo candeal; para arroz, considerá parboiled. Ajustá la porción y acompañá con verduras, legumbres o proteína.";
  }
  return bloque;
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

export default async function handler(req, res) {
  if (req.method === "POST" && req.body?.accion === "heladera") {
    await consultarHeladera(req, res);
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
    if (req.query?.vista === "supermercado") {
      const auth = await validarUsuario(req);
      if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
      const reglasSuper = await supabaseFetch(`reglas?select=id,combinacion,resultado,nivel_acceso,momento_requerido,familia_key&combinacion=like.Supermercado%3A%20*&momento_requerido=eq.Durante%20la%20compra%20en%20supermercado&order=combinacion.asc`);
      const bloques = reglasSuper.map(parsearBloqueSupermercado);
      if (auth.nivelAcceso !== "Premium") return res.status(200).json({ ok:true, requierePremium:true, bloques:bloques.map((b)=>({id:b.id,titulo:b.titulo,nivelAcceso:b.nivelAcceso})) });
      return res.status(200).json({ ok:true, requierePremium:false, bloques });
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
