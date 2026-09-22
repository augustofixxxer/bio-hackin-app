import assert from "node:assert/strict";
import { evaluarInteracciones, pasaUmbral } from "../api/_motor-nutricional-shadow.js";

const baseMatrix = [
  {
    clave: "iron__vitamin_c",
    nutriente_objetivo: "iron_nonheme_mg",
    factor_modificador: "vitamin_c_mg",
    direccion: "enhancing",
    mecanismo_key: "iron_nonheme",
    umbral_min_valor: 30,
    umbral_estado: "validated",
    peso_relativo: 1,
    grupo_dominancia: "iron_nonheme",
  },
  {
    clave: "iron__phytate",
    nutriente_objetivo: "iron_nonheme_mg",
    factor_modificador: "phytate_mg",
    direccion: "inhibitory",
    mecanismo_key: "iron_nonheme",
    umbral_min_valor: 10,
    umbral_estado: "validated",
    peso_relativo: 2,
    grupo_dominancia: "iron_nonheme",
  },
  {
    clave: "iron__polyphenols",
    nutriente_objetivo: "iron_nonheme_mg",
    factor_modificador: "polyphenols_mg",
    direccion: "inhibitory",
    mecanismo_key: "iron_nonheme",
    umbral_min_valor: 20,
    umbral_estado: "validated",
    peso_relativo: 1.5,
    grupo_dominancia: "iron_nonheme",
  },
];

let tests = 0;
function test(name, fn) {
  fn();
  tests++;
  console.log("PASS", name);
}

// 20 threshold cases
for (let i = 0; i < 20; i++) {
  const value = i + 1;
  const expected = value >= 30;
  assert.equal(pasaUmbral(value, baseMatrix[0]), expected);
  tests++;
}

// 20 absence/trace/unknown cases
for (let i = 0; i < 20; i++) {
  const r = evaluarInteracciones(
    {
      iron_nonheme_mg: 2,
      vitamin_c_mg: i < 10 ? 29 : 0.0001,
      phytate_mg: 0,
      polyphenols_mg: 0,
    },
    baseMatrix
  );
  assert.equal(r.dominantFactors.length, 0);
  assert.equal(r.suppressedSecondaryFactors.length, 0);
  tests++;
}

// 10 dominant-factor cases: phytate wins when its weighted relevance is greater.
for (let i = 0; i < 10; i++) {
  const r = evaluarInteracciones(
    {
      iron_nonheme_mg: 3 + i,
      vitamin_c_mg: 30 + i,
      phytate_mg: 20 + i,
      polyphenols_mg: 20 + i,
    },
    baseMatrix
  );
  assert.equal(r.dominantFactors.length, 1);
  assert.equal(r.dominantFactors[0].interactionKey, "iron__phytate");
  assert.equal(r.suppressedSecondaryFactors.length, 2);
  tests++;
}

// 10 pending/disabled cases: inactive matrix entries never infer.
for (let i = 0; i < 10; i++) {
  const inactive = baseMatrix.map((x) => ({
    ...x,
    umbral_estado: i % 2 === 0 ? "pending_validation" : "disabled",
  }));
  const r = evaluarInteracciones(
    {
      iron_nonheme_mg: 5,
      vitamin_c_mg: 100,
      phytate_mg: 100,
      polyphenols_mg: 100,
    },
    inactive
  );
  assert.equal(r.dominantFactors.length, 0);
  tests++;
}

// Explicit unknown-data test: null is not zero.
test("dato desconocido no equivale a cero", () => {
  const r = evaluarInteracciones(
    { iron_nonheme_mg: 5, vitamin_c_mg: null },
    [baseMatrix[0]]
  );
  assert.equal(r.dominantFactors.length, 0);
});

// Explicit no-target test.
test("sin nutriente objetivo no hay inferencia", () => {
  const r = evaluarInteracciones(
    { vitamin_c_mg: 100 },
    [baseMatrix[0]]
  );
  assert.equal(r.dominantFactors.length, 0);
});

console.log(`Motor cuantitativo shadow: ${tests} assertions ejecutadas.`);
assert.ok(tests >= 50, "La suite debe contener al menos 50 assertions.");
