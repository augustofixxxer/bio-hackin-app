// Motor nutricional cuantitativo — SHADOW v0.1
// No está importado por registrar-comida.js.
// Propósito: evaluar vectores cuantitativos contra interacciones ya validadas.
// Nunca genera copy ni decisiones clínicas.

function numeroFinito(v) {
  return typeof v === "number" && Number.isFinite(v);
}

function pasaUmbral(valor, interaccion) {
  // Contrato estricto: una interacción validated sin umbral numérico NO es ejecutable.
  if (!numeroFinito(valor)) return false;
  if (interaccion.umbral_estado !== "validated") return false;
  if (!numeroFinito(interaccion.umbral_min_valor)) return false;
  return valor >= interaccion.umbral_min_valor;
}

function evaluarInteracciones(vector, interacciones) {
  const candidatas = [];

  for (const i of interacciones || []) {
    if (i.umbral_estado !== "validated") continue;
    if (!numeroFinito(i.umbral_min_valor)) continue;
    if (!numeroFinito(i.peso_relativo) || i.peso_relativo <= 0) continue;
    if (!i.fuente_id) continue;

    const objetivo = vector?.[i.nutriente_objetivo];
    const modificador = vector?.[i.factor_modificador];

    // Sin dato del objetivo o modificador no se puede inferir.
    // Ausencia de dato nunca equivale a cero.
    if (!numeroFinito(objetivo) || !numeroFinito(modificador)) continue;
    if (objetivo <= 0) continue;
    if (!pasaUmbral(modificador, i)) continue;

    const relevancia = Math.abs(modificador) * Math.abs(i.peso_relativo);
    if (relevancia <= 0) continue;

    candidatas.push({
      interactionKey: i.clave,
      mechanismKey: i.mecanismo_key,
      targetNutrient: i.nutriente_objetivo,
      factorNutrient: i.factor_modificador,
      direction: i.direccion,
      dominanceGroup: i.grupo_dominancia || i.mecanismo_key,
      relevance,
    });
  }

  const grupos = new Map();
  for (const c of candidatas) {
    const actual = grupos.get(c.dominanceGroup);
    if (!actual || c.relevance > actual.relevance) grupos.set(c.dominanceGroup, c);
  }

  const dominantes = [...grupos.values()].sort((a, b) => b.relevance - a.relevance);
  const dominantesKeys = new Set(dominantes.map((d) => d.interactionKey));

  return {
    engineVersion: "quant-v0.1",
    status: dominantes.length ? "candidate" : "none",
    dominantFactors: dominantes,
    suppressedSecondaryFactors: candidatas.filter((c) => !dominantesKeys.has(c.interactionKey)),
  };
}

export { evaluarInteracciones, pasaUmbral };
