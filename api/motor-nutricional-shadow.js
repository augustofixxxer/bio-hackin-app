// Fase 3 — interfaz ejecutable del motor cuantitativo en modo shadow.
// No sustituye registrar-comida.js ni activa Capa 2.
import { supabaseFetch, SUPABASE_URL, SUPABASE_KEY } from "./_supabase.js";

const FIXTURES = new Set(["pollo_papas","arroz_pollo","caballa_brocoli","brocoli_papa","guiso_lentejas","guiso_arroz","guiso_fideos","ravioles","empanadas","asado"]);
function json(res,status,payload){ res.status(status).json(payload); }

export default async function handler(req,res){
  if(req.method !== "POST") return json(res,405,{error:"Método no permitido, usar POST."});
  if(!SUPABASE_URL || !SUPABASE_KEY) return json(res,500,{error:"Falta configuración de Supabase."});
  const token = process.env.MOTOR_NUTRICIONAL_SHADOW_TOKEN;
  if(!token || req.headers?.["x-motor-shadow-token"] !== token) return json(res,401,{error:"Interfaz shadow no autorizada."});
  const { fixture } = req.body || {};
  if(typeof fixture !== "string" || !FIXTURES.has(fixture)) return json(res,400,{error:"Fixture inválido.",fixtures:[...FIXTURES]});
  try {
    const comidas = await supabaseFetch("motor_nutricional_qa_comidas?clave=eq."+encodeURIComponent(fixture)+"&select=id,clave,descripcion,tipo,estado");
    if(!comidas.length) return json(res,404,{error:"Fixture no encontrado.",fixture});
    const comida=comidas[0];
    const componentes = await supabaseFetch("motor_nutricional_qa_componentes?comida_id=eq."+comida.id+"&select=nombre_registrado,gramos_fixture,preparacion_fixture,estado");
    const vectores = await supabaseFetch("motor_nutricional_qa_vectores?comida_id=eq."+comida.id+"&select=nutriente_id,estado_vector,valor_total,valor_min_total,valor_max_total,elegible_interaccion");
    const arquetipo = await supabaseFetch("motor_nutricional_qa_arquetipos_base?arquetipo_clave=eq."+encodeURIComponent(fixture)+"&select=arquetipo_clave,nombre_base,porcion_estandar_g,estado_qa,decision_motor,reutilizable");
    const matriz = await supabaseFetch("motor_nutricional_qa_matriz_composicion?arquetipo_clave=eq."+encodeURIComponent(fixture)+"&select=arquetipo_clave,estado_qa,decision_motor,composicion_metodo,componentes_definidos");
    const interacciones = await supabaseFetch("motor_nutricional_qa_interacciones?select=estado_qa,tiene_umbral,tiene_unidad_umbral,tiene_peso,tiene_fuente,evidencia_suficiente,dominancia_definida");
    const vectorCompleto = vectores.length>0 && vectores.every(v=>v.estado_vector==="completo");
    const interaccionesBloqueadas = interacciones.length>0 && interacciones.every(v=>v.estado_qa==="bloqueada");
    const identidadApta = arquetipo[0]?.estado_qa==="apta_qa" && matriz[0]?.estado_qa==="apta_qa";
    let decision;
    if(!identidadApta) decision="bloqueado_por_identidad_o_matriz";
    else if(!vectorCompleto) decision="bloqueado_por_vector_incompleto";
    else if(!interaccionesBloqueadas) decision="bloqueado_por_estado_interacciones";
    else decision="base_lista_para_shadow_no_activacion";
    return json(res,200,{engine:"motor_nutricional",version:"v0.2-shadow",modo:"shadow",fixture,identidad:{arquetipo:arquetipo[0]||null,matriz:matriz[0]||null,componentes},vector:{total:vectores.length,completos:vectores.filter(v=>v.estado_vector==="completo").length,estados:[...new Set(vectores.map(v=>v.estado_vector))],completo:vectorCompleto},interacciones:{total:interacciones.length,bloqueadas:interaccionesBloqueadas},decision,activable:false});
  } catch(err) { return json(res,500,{error:"Error evaluando motor shadow.",detail:String(err)}); }
}