// Alimenta el Explorador con alternativas reutilizables.
import { emitirEventoProducto } from "./_eventos-producto.js";
import { usuarioIdDesdeRequest } from "./_sesion.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function supabaseFetch(path) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" } });
  const text = await resp.text();
  const data = text ? JSON.parse(text) : null;
  if (!resp.ok) throw new Error((data && (data.message || data.error)) || `Supabase respondió ${resp.status}`);
  return data;
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
  if (req.method === "POST") {
    const { evento, contexto, metadata } = req.body || {};
    await emitirEventoProducto({ usuarioId: usuarioIdDesdeRequest(req), evento, contexto, metadata });
    res.status(200).json({ ok: true });
    return;
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) { res.status(500).json({ error: "Falta configurar Supabase." }); return; }
  try {
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
