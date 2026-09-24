// Fase 3 — interfaz ejecutable del motor cuantitativo en modo shadow.
// QA interno únicamente. No sustituye registrar-comida.js ni activa Capa 2.

const FIXTURES = new Set(["pollo_papas","arroz_pollo","caballa_brocoli","brocoli_papa","guiso_lentejas","guiso_arroz","guiso_fideos","ravioles","empanadas","asado"]);

async function db(path) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("Supabase no configurado.");
  const response = await fetch(base + "/rest/v1/" + path, {headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"}});
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error((data && (data.message || data.error)) || "Supabase respondió " + response.status);
  return data;
}

export default async function handler(req,res){
  if (req.method !== "POST") return res.status(405).json({error:"Método no permitido."});
  const shadowToken = process.env.MOTOR_NUTRICIONAL_SHADOW_TOKEN;
  if (!shadowToken || req.headers["x-motor-shadow-token"] !== shadowToken) return res.status(401).json({error:"Interfaz shadow no autorizada."});
  const fixture = req.body && req.body.fixture;
  if (typeof fixture !== "string" || !FIXTURES.has(fixture)) return res.status(400).json({error:"Fixture inválido.",fixtures:Array.from(FIXTURES)});
  try {
    const comidas = await db("motor_nutricional_qa_comidas?clave=eq."+encodeURIComponent(fixture)+"&select=id,clave,descripcion,tipo,estado");
    if (!comidas || !comidas.length) return res.status(404).json({error:"Fixture no encontrado.",fixture});
    const comida = comidas[0];
    const componentes = await db("motor_nutricional_qa_componentes?comida_id=eq."+comida.id+"&select=nombre_registrado,gramos_fixture,preparacion_fixture,estado");
    const vectores = await db("motor_nutricional_qa_vectores?comida_id=eq."+comida.id+"&select=nutriente_id,estado_vector,valor_total,valor_min_total,valor_max_total,elegible_interaccion");
    const arquetipos = await db("motor_nutricional_qa_arquetipos_base?arquetipo_clave=eq."+encodeURIComponent(fixture)+"&select=arquetipo_clave,nombre_base,porcion_estandar_g,estado_qa,decision_motor,reutilizable");
    const matrices = await db("motor_nutricional_qa_matriz_composicion?arquetipo_clave=eq."+encodeURIComponent(fixture)+"&select=arquetipo_clave,estado_qa,decision_motor,composicion_metodo,componentes_definidos");
    const interacciones = await db("motor_nutricional_qa_interacciones?select=estado_qa,tiene_umbral,tiene_unidad_umbral,tiene_peso,tiene_fuente,evidencia_suficiente,dominancia_definida");
    const vectorCompleto = Array.isArray(vectores) && vectores.length > 0 && vectores.every(v => v.estado_vector === "completo");
    const interaccionesBloqueadas = Array.isArray(interacciones) && interacciones.length > 0 && interacciones.every(v => v.estado_qa === "bloqueada");
    const identidadApta = arquetipos[0] && arquetipos[0].estado_qa === "apta_qa" && matrices[0] && matrices[0].estado_qa === "apta_qa";
    let decision = "bloqueado_por_vector_incompleto";
    if (!identidadApta) decision = "bloqueado_por_identidad_o_matriz";
    else if (vectorCompleto && !interaccionesBloqueadas) decision = "bloqueado_por_estado_interacciones";
    else if (vectorCompleto && interaccionesBloqueadas) decision = "base_lista_para_shadow_no_activacion";
    return res.status(200).json({engine:"motor_nutricional",version:"v0.2-shadow",modo:"shadow",fixture,identidad:{arquetipo:arquetipos[0] || null,matriz:matrices[0] || null,componentes},vector:{total:vectores.length,completos:vectores.filter(v=>v.estado_vector==="completo").length,estados:Array.from(new Set(vectores.map(v=>v.estado_vector))),completo:vectorCompleto},interacciones:{total:interacciones.length,bloqueadas:interaccionesBloqueadas},decision,activable:false});
  } catch (error) { return res.status(500).json({error:"Error evaluando motor shadow.",detail:String(error)}); }
}
