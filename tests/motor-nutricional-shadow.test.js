import assert from "node:assert/strict";
import test from "node:test";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const NEW_ENGINE_URL = process.env.MOTOR_NUTRICIONAL_ENGINE_URL;

async function supabase(path) {
  assert.ok(SUPABASE_URL, "Falta SUPABASE_URL.");
  assert.ok(SUPABASE_SERVICE_ROLE_KEY, "Falta SUPABASE_SERVICE_ROLE_KEY.");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  const body = await response.text();
  assert.equal(response.ok, true, `Supabase respondió ${response.status}: ${body}`);
  return body ? JSON.parse(body) : null;
}

/**
 * Fase 3 — shadow gate.
 *
 * Este test NO cambia producción y NO activa Capa 2.
 * Su objetivo es impedir que el motor nuevo se declare migrado mientras:
 * 1) no exista una interfaz ejecutable del motor nuevo;
 * 2) las interacciones sigan bloqueadas;
 * 3) los vectores requeridos por los fixtures no estén completos.
 *
 * La comparación legacy vs nuevo debe ejecutarse únicamente cuando
 * MOTOR_NUTRICIONAL_ENGINE_URL apunte a una interfaz real y verificable.
 */

test("shadow gate: el motor nuevo debe tener interfaz ejecutable antes de migrar", async () => {
  assert.ok(
    NEW_ENGINE_URL,
    "BLOQUEADO: MOTOR_NUTRICIONAL_ENGINE_URL no está definido. No existe una interfaz ejecutable verificable para comparar legacy vs nuevo."
  );
});

test("shadow gate: Capa 2 permanece bloqueada", async () => {
  const rows = await supabase(
    "motor_nutricional_qa_interacciones?select=estado_qa"
  );
  assert.ok(Array.isArray(rows) && rows.length > 0, "No se encontraron filas QA de interacciones.");
  assert.ok(
    rows.every((row) => row.estado_qa === "bloqueada"),
    "FALLO DE SEGURIDAD: existe una interacción que dejó de estar bloqueada."
  );
});

test("shadow gate: ningún vector incompleto puede entrar al comparador", async () => {
  const rows = await supabase(
    "motor_nutricional_qa_vectores?select=estado_vector"
  );
  assert.ok(Array.isArray(rows), "Respuesta QA de vectores inválida.");
  const incompletos = rows.filter(
    (row) => !["completo"].includes(row.estado_vector)
  );
  assert.equal(
    incompletos.length,
    0,
    `BLOQUEADO: hay ${incompletos.length} vectores no completos; no se permite activar interacciones sobre ellos.`
  );
});
