// Resolver determinista de duplas culinarias. Sin IA generativa ni servicios pagos.
import { supabaseFetch } from "./_supabase.js";
import { resolverFichaPlato, normalizarEntrada } from "./_catalogo-platos.js";

const CONECTORES = /\s+(acompañado\s+de|acompanado\s+de|con|y)\s+/i;

function separarDupla(texto) {
  const original = String(texto || "").trim();
  const match = CONECTORES.exec(original);
  if (!match || match.index === undefined) return null;
  const principal = original.slice(0, match.index).trim();
  const acompanamiento = original.slice(match.index + match[0].length).trim();
  if (!principal || !acompanamiento) return null;
  return { principal, acompanamiento, conector: match[1].toLocaleLowerCase("es") };
}

async function resolverEntidad(texto) {
  // "Milanesa" sola es ambigua en el catálogo; en el uso rioplatense se interpreta
  // como milanesa de carne salvo que el usuario especifique pollo, hígado o berenjena.
  const limpio = normalizarEntrada(texto);
  const consulta = limpio === "milanesa" ? "milanesa de carne" : texto;
  // El combinador puede resolver fichas inactivas solo para contrastarlas con una dupla activa.
  // Esto evita publicar el catálogo individual mientras habilita las combinaciones aprobadas.\n  return resolverFichaPlato(consulta, { incluirInactivos: true });
}

function fichaPublica(ficha, nombreEntrada) {
  return {
    plato_id: ficha.plato_id,
    nombre: nombreEntrada || ficha.nombre || "Tu comida",
    resumen: ficha.resumen,
    hack: ficha.hack,
    que_observar: ficha.que_observar,
    fallback: Boolean(ficha.fallback)
  };
}

export async function resolverCombinacionTexto(textoUsuario) {
  const trace = { etapa: "inicio", textoRecibido: String(textoUsuario || ""), conectorDetectado: null, principalTexto: null, acompanamientoTexto: null, principalId: null, acompanamientoId: null, filasMatriz: null, coincidencia: null, error: null };
  const partes = separarDupla(textoUsuario);
  if (!partes) {
    trace.etapa = "sin_conector";
    console.info("[combinador-trace]", JSON.stringify(trace));
    return { modo: "sin_dupla", detectada: false, ...(process.env.VERCEL_ENV === "preview" ? { trace } : {}) };
  }
  trace.etapa = "conector_detectado";
  trace.conectorDetectado = partes.conector;
  trace.principalTexto = partes.principal;
  trace.acompanamientoTexto = partes.acompanamiento;
  console.info("[combinador-trace]", JSON.stringify(trace));

  try {
    const [principal, acompanamiento] = await Promise.all([
      resolverEntidad(partes.principal),
      resolverEntidad(partes.acompanamiento)
    ]);
    trace.etapa = "entidades_resueltas";
    trace.principalId = principal?.plato_id || null;
    trace.acompanamientoId = acompanamiento?.plato_id || null;
    console.info("[combinador-trace]", JSON.stringify(trace));

    const filtroActivo = process.env.VERCEL_ENV === "preview" ? "" : "&activo=eq.true";
    const filas = await supabaseFetch(
      "preview_combinaciones_platos?select=combinacion_id,plato_principal_id,acompanamiento_id,sinonimos,resumen_hibrido,hack_combinado,que_observar" +
      filtroActivo
    );

    trace.filasMatriz = Array.isArray(filas) ? filas.length : -1;
    const combinacion = (Array.isArray(filas) ? filas : []).find((fila) =>
      fila.plato_principal_id === principal.plato_id &&
      fila.acompanamiento_id === acompanamiento.plato_id
    );
    trace.coincidencia = combinacion?.combinacion_id || null;
    trace.etapa = combinacion ? "dupla_encontrada" : "sin_coincidencia_matriz";
    console.info("[combinador-trace]", JSON.stringify(trace));

    if (combinacion) {
      return {
        modo: "dupla",
        detectada: true,
        entidades: { principal: principal.plato_id, acompanamiento: acompanamiento.plato_id },
        nombres: { principal: partes.principal, acompanamiento: partes.acompanamiento },
        cards: [
          { titulo: "Resumen de la combinación", texto: combinacion.resumen_hibrido },
          { titulo: "El super-hack combinado", texto: combinacion.hack_combinado },
          { titulo: "Qué observar", texto: combinacion.que_observar }
        ],
        fallback: false,
        ...(process.env.VERCEL_ENV === "preview" ? { trace } : {})
      };
    }

    const fichaPrincipal = fichaPublica(principal, partes.principal);
    const fichaAcompanamiento = fichaPublica(acompanamiento, partes.acompanamiento);
    return {
      modo: "fallback",
      detectada: true,
      entidades: { principal: principal.plato_id, acompanamiento: acompanamiento.plato_id },
      nombres: { principal: partes.principal, acompanamiento: partes.acompanamiento },
      cards: [
        { titulo: "Resumen", texto: fichaPrincipal.resumen }
      ],
      puente: {
        etiqueta: "Ver los consejos de cada plato por separado",
        platos: [
          { nombre: partes.principal, ficha: fichaPrincipal },
          { nombre: partes.acompanamiento, ficha: fichaAcompanamiento }
        ]
      },
      fallback: true,
      ...(process.env.VERCEL_ENV === "preview" ? { trace } : {})
    };
  } catch (error) {
    trace.etapa = "error";
    trace.error = String(error?.message || error);
    console.error("[combinador-trace]", JSON.stringify(trace));
    console.error("[combinador-platos] No se pudo resolver la dupla; se devuelve fallback seguro.");
    const ficha = await resolverFichaPlato(partes.principal).catch(() => null);
    const segura = ficha || {
      resumen: "Todavía no tenemos una ficha específica para esta comida. La preparación y los ingredientes principales ayudan a ponerla en contexto.",
      hack: "Describí los ingredientes y la preparación; no hace falta cambiar todo de una vez.",
      que_observar: "Prestá atención a tu saciedad, comodidad digestiva y energía durante las horas posteriores. Son observaciones personales, no un diagnóstico.",
      plato_id: "ficha-generica",
      fallback: true
    };
    return {
      modo: "fallback",
      detectada: true,
      cards: [{ titulo: "Resumen", texto: segura.resumen }],
      puente: {
        etiqueta: "Ver los consejos de cada plato por separado",
        platos: [{ nombre: partes.principal, ficha: fichaPublica(segura, partes.principal) }]
      },
      fallback: true,
      ...(process.env.VERCEL_ENV === "preview" ? { trace } : {})
    };
  }
}

export { separarDupla };
