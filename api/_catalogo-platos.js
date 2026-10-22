// api/_catalogo-platos.js
// Resolución determinista de fichas editoriales. No usa IA ni genera copy.
import { supabaseFetch } from "./_supabase.js";

const FALLBACK_PLATO = Object.freeze({
  plato_id: "ficha-generica",
  nombre: "Tu comida",
  resumen: "Todavía no tenemos una ficha específica para esta combinación. La preparación y los ingredientes principales ayudan a ponerla en contexto.",
  hack: "Si querés, describí el ingrediente principal y cómo está preparado (por ejemplo, al horno, a la plancha o frito). No hace falta cambiar todo de una vez.",
  que_observar: "Prestá atención a tu saciedad, comodidad digestiva y energía durante las horas posteriores. Son observaciones personales, no un diagnóstico.",
  fallback: true
});

const PALABRAS_FUNCION = new Set(["de", "del", "la", "las", "el", "los", "al", "a", "y", "con", "en", "para"]);

function singularizarToken(token) {
  if (token.length > 5 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

function normalizarEntrada(valor) {
  const base = String(valor || "")
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .replace(/[^a-z0-9ñ\\s-]/g, " ")
    .replace(/\\s+/g, " ")
    .trim();
  return base.split(" ")
    .filter(token => token && !PALABRAS_FUNCION.has(token))
    .map(singularizarToken)
    .join(" ");
}

function contieneFrase(texto, frase) {
  if (!texto || !frase) return false;
  return (" " + texto + " ").includes(" " + frase + " ");
}

function puntuar(texto, sinonimo) {
  const frase = normalizarEntrada(sinonimo);
  if (!frase) return 0;
  const cantidadTokens = frase.split(" ").filter(Boolean).length;
  // Una coincidencia específica ("bife cerdo") gana a una genérica ("bife").
  if (texto === frase) return 10000 + cantidadTokens * 100 + frase.length;
  if (contieneFrase(texto, frase)) return 1000 + cantidadTokens * 100 + frase.length;
  return 0;
}

export async function resolverFichaPlato(textoUsuario) {
  const texto = normalizarEntrada(textoUsuario);
  if (!texto) return { ...FALLBACK_PLATO };
  try {
    const filas = await supabaseFetch(
      "preview_catalogo_maestro_platos?select=plato_id,sinonimos,resumen,hack,que_observar&activo=eq.true"
    );
    if (!Array.isArray(filas)) return { ...FALLBACK_PLATO };
    let mejor = null;
    let mejorPuntaje = 0;
    for (const fila of filas) {
      const sinonimos = Array.isArray(fila.sinonimos) ? fila.sinonimos : [];
      for (const sinonimo of sinonimos) {
        const score = puntuar(texto, sinonimo);
        if (score > mejorPuntaje) {
          mejor = fila;
          mejorPuntaje = score;
        }
      }
    }
    if (!mejor) return { ...FALLBACK_PLATO };
    return {
      plato_id: mejor.plato_id,
      nombre: String(textoUsuario || mejor.plato_id || "Tu comida").trim(),
      resumen: mejor.resumen,
      hack: mejor.hack,
      que_observar: mejor.que_observar,
      fallback: false
    };
  } catch (error) {
    // La ficha genérica mantiene la respuesta utilizable ante fallos del catálogo.
    console.error("[catalogo-platos] No se pudo resolver la ficha; se usa fallback.");
    return { ...FALLBACK_PLATO };
  }
}

export { FALLBACK_PLATO, normalizarEntrada };
// END: api/_catalogo-platos.js
