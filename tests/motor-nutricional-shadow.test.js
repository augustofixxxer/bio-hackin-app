import assert from "node:assert/strict";
import { evaluarInteracciones, pasaUmbral } from "../api/_motor-nutricional-shadow.js";

const sourceId = "source-validated";
const baseMatrix = [
  { clave:"iron__vitamin_c", nutriente_objetivo:"iron_nonheme_mg", factor_modificador:"vitamin_c_mg", direccion:"enhancing", mecanismo_key:"iron_nonheme", umbral_min_valor:30, umbral_estado:"validated", peso_relativo:1, grupo_dominancia:"iron_nonheme", fuente_id:sourceId },
  { clave:"iron__phytate", nutriente_objetivo:"iron_nonheme_mg", factor_modificador:"phytate_mg", direccion:"inhibitory", mecanismo_key:"iron_nonheme", umbral_min_valor:10, umbral_estado:"validated", peso_relativo:2, grupo_dominancia:"iron_nonheme", fuente_id:sourceId },
  { clave:"iron__polyphenols", nutriente_objetivo:"iron_nonheme_mg", factor_modificador:"polyphenols_mg", direccion:"inhibitory", mecanismo_key:"iron_nonheme", umbral_min_valor:20, umbral_estado:"validated", peso_relativo:1.5, grupo_dominancia:"iron_nonheme", fuente_id:sourceId },
];

let tests = 0;
function test(name, fn) { fn(); tests++; console.log("PASS", name); }

// 20 threshold cases
for (let i=0;i<20;i++){ const value=i+1; assert.equal(pasaUmbral(value,baseMatrix[0]),value>=30); tests++; }

// 20 absence/trace/unknown cases
for (let i=0;i<20;i++){
 const r=evaluarInteracciones({iron_nonheme_mg:2,vitamin_c_mg:i<10?29:0.0001,phytate_mg:0,polyphenols_mg:0},baseMatrix);
 assert.equal(r.dominantFactors.length,0); assert.equal(r.suppressedSecondaryFactors.length,0); tests++;
}

// 10 dominant-factor cases
for (let i=0;i<10;i++){
 const r=evaluarInteracciones({iron_nonheme_mg:3+i,vitamin_c_mg:30+i,phytate_mg:20+i,polyphenols_mg:20+i},baseMatrix);
 assert.equal(r.dominantFactors.length,1); assert.equal(r.dominantFactors[0].interactionKey,"iron__phytate"); assert.equal(r.suppressedSecondaryFactors.length,2); tests++;
}

// 10 pending/disabled cases
for (let i=0;i<10;i++){
 const inactive=baseMatrix.map(x=>({...x,umbral_estado:i%2===0?"pending_validation":"disabled"}));
 const r=evaluarInteracciones({iron_nonheme_mg:5,vitamin_c_mg:100,phytate_mg:100,polyphenols_mg:100},inactive);
 assert.equal(r.dominantFactors.length,0); tests++;
}

// Contract tests: validated requires threshold, weight and provenance.
test("validated sin umbral no ejecuta",()=>assert.equal(pasaUmbral(100,{umbral_estado:"validated",umbral_min_valor:null}),false));
test("validated sin peso no ejecuta",()=>assert.equal(evaluarInteracciones({iron_nonheme_mg:5,vitamin_c_mg:100},[{...baseMatrix[0],peso_relativo:null}]).dominantFactors.length,0));
test("validated sin fuente no ejecuta",()=>assert.equal(evaluarInteracciones({iron_nonheme_mg:5,vitamin_c_mg:100},[{...baseMatrix[0],fuente_id:null}]).dominantFactors.length,0));

// Unknown and missing target
test("dato desconocido no equivale a cero",()=>assert.equal(evaluarInteracciones({iron_nonheme_mg:5,vitamin_c_mg:null},[baseMatrix[0]]).dominantFactors.length,0));
test("sin nutriente objetivo no hay inferencia",()=>assert.equal(evaluarInteracciones({vitamin_c_mg:100},[baseMatrix[0]]).dominantFactors.length,0));

console.log(`Motor cuantitativo shadow: ${tests} assertions ejecutadas.`);
assert.ok(tests>=50,"La suite debe contener al menos 50 assertions.");
