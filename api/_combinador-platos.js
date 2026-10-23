// Combinador de fichas del catálogo maestro. No usa tablas de duplas ni genera copy.
import { resolverFichaPlato, normalizarEntrada } from "./_catalogo-platos.js";

const CONECTORES = /\s+(con|y)\s+/i;

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
  // En el uso rioplatense, "milanesa" sin especificación se interpreta como carne.
  const consulta = normalizarEntrada(texto) === "milanesa" ? "milanesa de carne" : texto;
  // Se permiten fichas inactivas en la resolución interna: el catálogo individual
  // conserva su visibilidad actual, pero sus fichas aprobadas pueden cruzarse aquí.
  return resolverFichaPlato(consulta, { incluirInactivos: true });
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

function crearTarjetas(principal, acompanamiento) {
  const pares = [
    { titulo: "Resumen", campo: "resumen" },
    { titulo: "Hack", campo: "hack" },
    { titulo: "Qué observar", campo: "que_observar" }
  ];
  return pares.map(({ titulo, campo }) => {
    const fichas = [
      { nombre: principal.nombre, texto: principal[campo] },
      { nombre: acompanamiento.nombre, texto: acompanamiento[campo] }
    ];
    return {
      titulo,
      fichas,
      // Compatibilidad con clientes anteriores: el contenido sigue siendo
      // exclusivamente el texto ya aprobado de las dos fichas individuales.
      texto: fichas.map((ficha) => `${ficha.nombre}: ${ficha.texto || ""}`).join("\n\n")
    };
  });
}

export async function resolverCombinacionTexto(textoUsuario) {
  const trace = {
    etapa: "inicio",
    textoRecibido: String(textoUsuario || ""),
    conectorDetectado: null,
    principalTexto: null,
    acompanamientoTexto: null,
    principalId: null,
    acompanamientoId: null,
    coincidencia: null,
    error: null
  };
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

  try {
    // Única fuente editorial: las fichas individuales del catálogo maestro.
    const [principalResuelta, acompanamientoResuelto] = await Promise.all([
      resolverEntidad(partes.principal),
      resolverEntidad(partes.acompanamiento)
    ]);
    const principal = fichaPublica(principalResuelta, partes.principal);
    const acompanamiento = fichaPublica(acompanamientoResuelto, partes.acompanamiento);
    trace.principalId = principal.plato_id;
    trace.acompanamientoId = acompanamiento.plato_id;
    trace.etapa = "fichas_resueltas";

    console.info("[combinador-trace]", JSON.stringify(trace));

    if (principal.fallback || acompanamiento.fallback) {
      trace.etapa = "ficha_no_encontrada";
      return {
        modo: "fallback",
        detectada: true,
        entidades: { principal: principal.plato_id, acompanamiento: acompanamiento.plato_id },
        nombres: { principal: partes.principal, acompanamiento: partes.acompanamiento },
        puente: {
          etiqueta: "Ver los consejos de cada plato por separado",
          platos: [
            { nombre: partes.principal, ficha: principal },
            { nombre: partes.acompanamiento, ficha: acompanamiento }
          ]
        },
        fallback: true,
        ...(process.env.VERCEL_ENV === "preview" ? { trace } : {})
      };
    }

    return {
      modo: "dupla",
      detectada: true,
      entidades: { principal: principal.plato_id, acompanamiento: acompanamiento.plato_id },
      nombres: { principal: partes.principal, acompanamiento: partes.acompanamiento },
      cards: crearTarjetas(principal, acompanamiento),
      fallback: false,
      ...(process.env.VERCEL_ENV === "preview" ? { trace } : {})
    };
  } catch (error) {
    trace.etapa = "error";
    trace.error = String(error?.message || error);
    console.error("[combinador-trace]", JSON.stringify(trace));
    return {
      modo: "fallback",
      detectada: true,
      puente: {
        etiqueta: "Ver los consejos de cada plato por separado",
        platos: [
          { nombre: partes.principal, ficha: fichaPublica(await resolverFichaPlato(partes.principal).catch(() => null) || { plato_id: "ficha-generica", resumen: "", hack: "", que_observar: "", fallback: true }, partes.principal) },
          { nombre: partes.acompanamiento, ficha: fichaPublica(await resolverFichaPlato(partes.acompanamiento).catch(() => null) || { plato_id: "ficha-generica", resumen: "", hack: "", que_observar: "", fallback: true }, partes.acompanamiento) }
        ]
      },
      fallback: true,
      ...(process.env.VERCEL_ENV === "preview" ? { trace } : {})
    };
  }
}

export { separarDupla };
