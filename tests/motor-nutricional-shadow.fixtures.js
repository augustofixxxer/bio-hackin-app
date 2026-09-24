import assert from "node:assert/strict";
import test from "node:test";
const NEW_ENGINE_URL=process.env.MOTOR_NUTRICIONAL_ENGINE_URL;
const SHADOW_TOKEN=process.env.MOTOR_NUTRICIONAL_SHADOW_TOKEN;
const LEGACY_ENGINE_URL=process.env.LEGACY_ENGINE_URL;
const FIXTURES=[
 {key:"pollo_papas",legacyInput:"pollo con papas"},
 {key:"arroz_pollo",legacyInput:"arroz con pollo"},
 {key:"caballa_brocoli",legacyInput:"caballa con brocoli"},
 {key:"brocoli_papa",legacyInput:"brocoli con papa"},
 {key:"guiso_lentejas",legacyInput:"guiso de lentejas"},
 {key:"guiso_arroz",legacyInput:"guiso de arroz"},
 {key:"guiso_fideos",legacyInput:"guiso de fideos"},
 {key:"ravioles",legacyInput:"ravioles con salsa"},
 {key:"empanadas",legacyInput:"empanadas al horno"},
 {key:"asado",legacyInput:"asado"}
];
async function post(url,body,headers={}){ const r=await fetch(url,{method:"POST",headers:{"content-type":"application/json",...headers},body:JSON.stringify(body)}); const text=await r.text(); assert.equal(r.ok,true,`${url} respondió ${r.status}: ${text}`); return text?JSON.parse(text):null; }
async function legacy(input){ assert.ok(LEGACY_ENGINE_URL,"Falta LEGACY_ENGINE_URL: comparación no verificable."); return post(LEGACY_ENGINE_URL,{texto:input,soloVista:true}); }
async function nuevo(key){ assert.ok(NEW_ENGINE_URL,"Falta MOTOR_NUTRICIONAL_ENGINE_URL: interfaz nueva no verificable."); assert.ok(SHADOW_TOKEN,"Falta MOTOR_NUTRICIONAL_SHADOW_TOKEN."); return post(NEW_ENGINE_URL,{fixture:key},{"x-motor-shadow-token":SHADOW_TOKEN}); }
for(const f of FIXTURES){ test(`fixture legacy↔nuevo: ${f.key}`,async()=>{ const [oldResult,newResult]=await Promise.all([legacy(f.legacyInput),nuevo(f.key)]); assert.equal(newResult.activable,false); assert.equal(newResult.interacciones.bloqueadas,true); assert.ok(Array.isArray(oldResult.bloqueos),"Salida legacy inválida."); assert.ok(["bloqueado_por_vector_incompleto","bloqueado_por_identidad_o_matriz","base_lista_para_shadow_no_activacion","bloqueado_por_estado_interacciones"].includes(newResult.decision)); }); }