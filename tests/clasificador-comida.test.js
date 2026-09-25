import test from "node:test";
import assert from "node:assert/strict";

process.env.GROQ_API_KEY = "test-key";

const originalFetch = globalThis.fetch;

async function loadClassifierWithResponse(categorias) {
  globalThis.fetch = async () => new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ categorias }) } }],
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
  const mod = await import("../api/_clasificador-ia.js?test=" + encodeURIComponent(categorias.join(",")));
  return mod.clasificarComidaIA;
}

test("rechaza carne roja si la IA la agrega sin evidencia en el texto", async () => {
  const clasificar = await loadClassifierWithResponse([
    "carne_roja",
    "lacteos",
    "harinas_refinadas",
  ]);

  const resultado = await clasificar("infusión con tostado de jamón y queso");

  assert.deepEqual(resultado, ["lacteos", "harinas"]);
});

test("conserva categorías cuando existe evidencia léxica explícita", async () => {
  const clasificar = await loadClassifierWithResponse([
    "carne_roja",
    "lacteos",
  ]);

  const resultado = await clasificar("bife con queso");

  assert.deepEqual(resultado, ["carne roja", "lacteos"]);
});

test.after(() => {
  globalThis.fetch = originalFetch;
});
