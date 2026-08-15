// Función serverless (Vercel). Recibe POST con { texto, momento, usuarioId }.
// Detecta coincidencias con las Reglas por palabras clave, crea el Registro Diario
// y los Bloqueos correspondientes en Supabase (Postgres).

import { emitirEvento, evaluarValidacionParalela } from "./_instrumentacion.js";
import { emitirEventoProducto } from "./_eventos-producto.js";
// BT-02 — conexión a Supabase unificada (ver api/_supabase.js).
import { supabaseFetch, SUPABASE_URL, SUPABASE_KEY } from "./_supabase.js";
// Capa de IA (Groq) — opcional, "dormida" hasta que exista GROQ_API_KEY en Vercel.
import { clasificarComidaIA } from "./_clasificador-ia.js";
import { elegirTipRelevanteIA } from "./_selector-tips-ia.js";
import { usuarioIdDesdeRequest } from "./_sesion.js";

// AUTENTICACIÓN REAL DE SESIÓN (29/07/2026): el usuarioId ya NO se toma de un
// campo suelto del body (eso permitía que cualquiera mandara el usuarioId de
// otra persona). Ahora se extrae del "pase" firmado (ver _sesion.js). El
// registro anónimo sigue permitido tal cual estaba: si no viene ningún pase,
// usuarioId queda undefined y el flujo sigue igual que antes.
//
// Sprint "Sanitización" — usuarioId se interpola en la query de verificarAcceso()
// más abajo, por eso debe validarse como UUID antes de llegar ahí (cinturón de
// seguridad extra, aunque ahora ya viene validado desde el pase firmado).
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function esUUIDValido(valor) {
  return typeof valor === "string" && UUID_REGEX.test(valor);
}

function normalizar(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function escapeRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function contienePalabraCompleta(textoNormalizado, clave) {
  const patron = new RegExp(`\\b${escapeRegex(clave)}\\b`);
  return patron.test(textoNormalizado);
}

// Evalúa una Regla contra el texto normalizado.
// Formato del campo "palabras_clave":
//   - Sin ";": lista simple, alcanza con que aparezca UNA cualquiera (regla de un solo alimento).
//   - Con UN ";": "Grupo A ; Grupo B" -> necesita al menos una palabra de CADA grupo (combinación real).
//   - Con DOS ";": "Grupo A ; Grupo B ; Disparadores" -> además de la combinación, cualquier
//     palabra de "Disparadores" alcanza sola (para platos compuestos que ya implican ambos, ej. "milanesa napolitana").
//   - Prefijo "TIP:" al inicio -> no es una alerta, es un tip positivo (no bloquea, se muestra distinto).
function evaluarRegla(textoNormalizado, palabrasClaveRaw) {
  let raw = (palabrasClaveRaw || "").trim();
  let esTip = false;
  if (/^tip:/i.test(raw)) {
    esTip = true;
    raw = raw.replace(/^tip:/i, "").trim();
  }

  const segmentos = raw
    .split(";")
    .map((seg) =>
      seg
        .split(",")
        .map((k) => normalizar(k.trim()))
        .filter(Boolean)
    )
    .filter((grupo) => grupo.length > 0);

  let coincide = false;
  if (segmentos.length <= 1) {
    const grupo = segmentos[0] || [];
    coincide = grupo.some((clave) => contienePalabraCompleta(textoNormalizado, clave));
  } else {
    const [grupoA, grupoB, disparadores] = segmentos;
    const matchA = grupoA.some((clave) => contienePalabraCompleta(textoNormalizado, clave));
    const matchB = grupoB.some((clave) => contienePalabraCompleta(textoNormalizado, clave));
    const matchDisparador = (disparadores || []).some((clave) => contienePalabraCompleta(textoNormalizado, clave));
    coincide = (matchA && matchB) || matchDisparador;
  }

  return { coincide, esTip };
}

// Auditoría de contenido 25/07/2026 — dos condiciones adicionales que evaluarRegla()
// no podía expresar (solo sabe buscar presencia de palabras, no ausencia ni horario):
//
// 1) palabras_excluyentes: si el texto contiene alguna, la regla NO dispara aunque
//    matchee sus palabras_clave. Corrige casos como "Avena sin activar" disparando
//    igual cuando el usuario SÍ activó el grano.
// 2) momento_requerido: si está seteado, la regla solo aplica cuando coincide con
//    el momento_dia real del registro (Desayuno/Almuerzo/Merienda/Cena) — no con
//    palabras del texto. Corrige reglas como "...Tardías (Cena)" que disparaban a
//    cualquier hora porque el motor nunca miraba el dato estructurado que ya existe.
function excluidoPorPalabra(textoNormalizado, palabrasExcluyentesRaw) {
  if (!palabrasExcluyentesRaw) return false;
  const palabras = palabrasExcluyentesRaw.split(",").map((p) => normalizar(p.trim())).filter(Boolean);
  return palabras.some((p) => contienePalabraCompleta(textoNormalizado, p));
}

function cumpleMomento(momentoRegistro, momentoRequerido) {
  if (!momentoRequerido) return true; // sin requisito -> no restringe nada
  if (!momentoRegistro) return false; // la regla exige momento pero no se proveyó ninguno
  return normalizar(momentoRegistro) === normalizar(momentoRequerido);
}

const PALABRAS_CASERO = ["casera", "caseras", "casero", "caseros", "en casa", "hecho en casa", "hecha en casa"];

// Diccionario de sinónimos — Sprint 9 (recomendado, nunca implementado) + hallazgo real 25/07/2026.
// No reemplaza el texto del usuario (eso se sigue guardando tal cual lo escribió, sin tocar).
// Solo AGREGA palabras equivalentes a una copia usada exclusivamente para matchear contra
// reglas/alternativas. Construido contra las palabras_clave REALES de las 32 reglas actuales
// (no inventado): el hueco más grande era "carne roja" — exige esa frase literal y no reconoce
// cortes comunes (bife, churrasco, vacío, asado...). Ampliar esta lista es barato y sin riesgo;
// es la mejora "gratis" acordada con Augusto mientras se evalúa una capa de IA para el resto.
const SINONIMOS = {
  // → "carne roja" (activa reglas 121855de "Carne Roja + Lácteos" y 5757e782 "Té + Hierro")
  bife: "carne roja", churrasco: "carne roja", vacio: "carne roja", matambre: "carne roja",
  costilla: "carne roja", cuadril: "carne roja", lomo: "carne roja", peceto: "carne roja",
  nalga: "carne roja", bondiola: "carne roja", carnaza: "carne roja", tapa: "carne roja",
  asado: "carne roja", parrillada: "carne roja", colita: "carne roja", entraña: "carne roja",
  // → "pescado" (activa regla e6297877 "Arroz + Proteínas Magras")
  salmon: "pescado", atun: "pescado", merluza: "pescado", trucha: "pescado", mero: "pescado",
  corvina: "pescado", pejerrey: "pescado", boga: "pescado", surubi: "pescado", abadejo: "pescado",
  // → "pollo" (misma regla e6297877)
  suprema: "pollo", pechuga: "pollo", muslo: "pollo", supremas: "pollo",
  // → "legumbres" (activa regla 105fe512 "Avena/Lentejas + Carne o Semillas")
  garbanzos: "legumbres", porotos: "legumbres", habas: "legumbres", arvejas: "legumbres",
};

function expandirSinonimos(textoNormalizado) {
  const palabras = textoNormalizado.split(/[^a-z0-9]+/).filter(Boolean);
  const agregados = new Set();
  for (const p of palabras) {
    if (SINONIMOS[p]) agregados.add(SINONIMOS[p]);
  }
  return agregados.size > 0 ? `${textoNormalizado} ${[...agregados].join(" ")}` : textoNormalizado;
}

function esVersionCasera(textoNormalizado) {
  return PALABRAS_CASERO.some((p) => textoNormalizado.includes(normalizar(p)));
}

// ---- Capa de datos: Supabase vía REST (PostgREST), sin SDK, mismo patrón que antes con Airtable ----
// BT-02: supabaseFetch/SUPABASE_URL/SUPABASE_KEY ahora vienen de api/_supabase.js (import arriba).

// Blindaje legal: bloquea el uso si no aceptó Términos, o si la cuenta fue suspendida.
async function verificarAcceso(usuarioId) {
  const rows = await supabaseFetch(
    `usuarios?id=eq.${usuarioId}&select=cuenta_suspendida,terminos_aceptados,nivel_acceso`
  );
  if (!rows.length) return { ok: false, status: 404, error: "Usuario no encontrado." };
  const u = rows[0];
  if (u.cuenta_suspendida === true) {
    return { ok: false, status: 403, error: "Esta cuenta fue suspendida. Contactanos si creés que es un error." };
  }
  if (u.terminos_aceptados !== true) {
    return { ok: false, status: 403, error: "Debés aceptar los Términos y Condiciones para continuar.", requiereTerminos: true };
  }
  return { ok: true, nivelAcceso: u.nivel_acceso || "gratuito" };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido, usar POST." });
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    res.status(500).json({ error: "Falta configurar SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY." });
    return;
  }

  const { texto, momento, soloVista, alternativaId } = req.body || {};
  if (!texto || typeof texto !== "string" || texto.trim().length === 0) {
    res.status(400).json({ error: "Falta el texto de la comida registrada." });
    return;
  }
  // Fase 4 (10/08/2026) — opcional, viene de CTA2 "Sumar a mi día". Si viene, tiene que
  // ser un UUID válido; si no viene, sigue siendo un registro de texto libre normal.
  if (alternativaId !== undefined && alternativaId !== null && !esUUIDValido(alternativaId)) {
    res.status(400).json({ error: "alternativaId inválido." });
    return;
  }

  // Si mandó un pase (header Authorization o body.pase) tiene que ser válido —
  // si no mandó ninguno, sigue siendo un registro anónimo válido, como siempre.
  const paseProvisto = !!(req.headers?.authorization || req.body?.pase);
  const usuarioId = usuarioIdDesdeRequest(req);
  if (paseProvisto && !usuarioId) {
    res.status(401).json({ error: "Sesión inválida o vencida. Volvé a iniciar sesión." });
    return;
  }

  let nivelAcceso = "gratuito";

  if (usuarioId) {
    if (!esUUIDValido(usuarioId)) {
      res.status(400).json({ error: "usuarioId inválido." });
      return;
    }
    try {
      const acceso = await verificarAcceso(usuarioId);

      // MIS Etapa 3 — Validación Paralela. No cambia el resultado de "acceso": solo
      // deja evidencia de si el modelo nuevo hubiera coincidido con esta decisión legacy.
      await evaluarValidacionParalela({
        usuarioId,
        capabilityName: "uso_basico_app",
        decisionLegacy: acceso.ok,
        sourceComponent: "registrar-comida",
      });

      if (!acceso.ok) {
        return res.status(acceso.status).json({ error: acceso.error, requiereTerminos: acceso.requiereTerminos });
      }
      nivelAcceso = acceso.nivelAcceso || "gratuito";
    } catch (err) {
      res.status(400).json({ error: "El usuarioId recibido no es válido.", detail: String(err) });
      return;
    }
  }

  try {
    const textoNormalizado = normalizar(texto);
    let textoParaMatching = expandirSinonimos(textoNormalizado);
    const versionCasera = esVersionCasera(textoNormalizado);

    // Capa de IA (opcional) — si Groq está configurada y responde a tiempo, suma más
    // categorías reconocidas al texto de matching. Si no, sigue igual que hasta ahora.
    const categoriasIA = await clasificarComidaIA(texto);
    if (categoriasIA && categoriasIA.length > 0) {
      textoParaMatching = `${textoParaMatching} ${categoriasIA.join(" ")}`;
    }

    // 1. Traer las Reglas con su Solución ya embebida (join nativo de Supabase, en un solo viaje)
    const reglas = await supabaseFetch(
      `reglas?select=id,combinacion,resultado,palabras_clave,nivel_riesgo,momento_requerido,palabras_excluyentes,soluciones(nombre_hackeo,adaptacion)`
    );

    // 2. Buscar coincidencias: separamos bloqueos reales (combinaciones) de tips positivos.
    // Se evalúa contra textoParaMatching (texto original + sinónimos), nunca contra el texto
    // que se guarda en el registro — eso sigue siendo exactamente lo que el usuario escribió.
    // Además del match de palabras, dos condiciones adicionales (auditoría 25/07/2026):
    // exclusión por palabra ("sin activar" mal detectado) y momento del día real (no adivinado
    // por texto) — ver excluidoPorPalabra()/cumpleMomento() más arriba.
    const evaluaciones = reglas.map((r) => {
      const evalPalabras = evaluarRegla(textoParaMatching, r.palabras_clave);
      const pasaExclusion = !excluidoPorPalabra(textoParaMatching, r.palabras_excluyentes);
      const pasaMomento = cumpleMomento(momento, r.momento_requerido);
      return {
        regla: r,
        coincide: evalPalabras.coincide && pasaExclusion && pasaMomento,
        esTip: evalPalabras.esTip,
      };
    });
    const coincidencias = evaluaciones.filter((e) => e.coincide && !e.esTip).map((e) => e.regla);
    const coincidenciasTip = evaluaciones.filter((e) => e.coincide && e.esTip).map((e) => e.regla);

    // Orden por especificidad (31/07/2026): una regla de un solo grupo de palabras clave
    // (ej. "tarta, tartas, pascualina") suele nombrar un plato puntual — más directamente
    // relacionada con lo que el usuario escribió. Una regla de varios grupos separados por
    // ";" (ej. "carne roja ; queso, crema, lacteos") es una interacción entre ingredientes
    // sueltos, más genérica. Mostrar primero lo específico evita que el usuario tenga que
    // leer 2-3 avisos genéricos antes de llegar al que realmente nombra su plato.
    const especificidad = (r) => ((r.palabras_clave || "").includes(";") ? 1 : 0);
    coincidencias.sort((a, b) => especificidad(a) - especificidad(b));

    // 2b. Si el texto indica versión casera, esas coincidencias quedan "resueltas"
    // (ya se aplicó el hackeo) y no se tratan como bloqueo real.
    const bloqueosReales = versionCasera ? [] : coincidencias;
    const resueltos = versionCasera ? coincidencias : [];

    // 3. Crear el Registro Diario — salvo en modo "planificar antes de comer" (soloVista):
    // ahí se evalúa todo exactamente igual, pero no se persiste nada, porque el usuario
    // todavía no comió — es una consulta preventiva, no un hecho consumado.
    const fechaHoy = new Date().toISOString().split("T")[0];
    let registroId = null;
    if (!soloVista) {
      const registroCreado = await supabaseFetch(`registro_diario_real`, {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          fecha: fechaHoy,
          comida_registrada: texto,
          ...(momento ? { momento_dia: momento } : {}),
          ...(usuarioId ? { usuario_id: usuarioId } : {}),
          ...(alternativaId ? { alternativa_id: alternativaId } : {}),
        }),
      });
      registroId = registroCreado[0].id;
    }

    // 4. Si no hay coincidencias reales, no se crean Bloqueos (tampoco en modo soloVista)
    let bloqueosCreados = [];
    if (!soloVista && bloqueosReales.length > 0) {
      bloqueosCreados = await supabaseFetch(`bloqueos`, {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(
          bloqueosReales.map((r) => ({
            nombre_bloqueo: r.combinacion || "Bloqueo detectado",
            comida_o_bebida: texto,
            fecha_deteccion: fechaHoy,
            registro_diario_id: registroId,
          }))
        ),
      });
    }

    // 5. Armar bloqueos reales. La solución concreta (el "cómo") queda para Premium desde
    // el 31/07/2026 — decisión del Fundador: el "resultado" (el "por qué") siempre es
    // gratis y completo, nunca se oculta, eso es la parte educativa no negociable. Lo que
    // pasa a ser de pago es el paso a paso accionable. El usuario gratuito nunca se queda
    // sin salida — recibe una frase puente honesta, nunca solo el problema sin más.
    const esPremiumComida = nivelAcceso === "Premium";
    const bloqueos = bloqueosReales.map((r, i) => ({
      combinacion: r.combinacion || "",
      resultado: r.resultado || "",
      nivelRiesgo: r.nivel_riesgo || "Bajo",
      solucion:
        esPremiumComida && r.soluciones
          ? { nombre: r.soluciones.nombre_hackeo || "", adaptacion: r.soluciones.adaptacion || "", premium: true }
          : null,
      invitacionPremium:
        !esPremiumComida && r.soluciones
          ? "Esto sí tiene forma de mejorarse sin dejar de comerlo. Sabemos que puede preocupar un poco, pero estás en el lugar indicado — te mostramos cómo en la sección Premium."
          : null,
      bloqueoId: bloqueosCreados[i]?.id,
    }));

    // 6. Armar resueltos (versión casera) como refuerzo positivo, sin crear Bloqueo
    const resueltosRespuesta = resueltos.map((r) => ({
      combinacion: r.combinacion || "",
      mensaje: "Ya aplicaste este hackeo con la versión casera.",
      solucion: r.soluciones
        ? { nombre: r.soluciones.nombre_hackeo || "", adaptacion: r.soluciones.adaptacion || "" }
        : null,
    }));

    // 7. Tips positivos de Reglas (siempre se muestran, marcadas con "TIP:" en Supabase)
    let sugerencias = coincidenciasTip.map((r) => ({
      nombre: r.combinacion || "",
      mecanismo: r.resultado || "",
      opcion: "",
      evidencia: "",
    }));

    // 7b. REEMPLAZADO 31/07/2026 (Opción B, decisión del Fundador) — el matching por
    // palabras sueltas contra alternativas_locales tuvo 5 falsos positivos reales
    // consecutivos (carne, salsa, harina, leche, queso) y quedó desactivado el mismo día.
    // En vez de seguir tapando palabra por palabra, ahora es Groq el que ENTIENDE cuál
    // ficha es realmente relevante — mismo IA que ya usamos para clasificar la comida,
    // llamado aparte, aislado (ver _selector-tips-ia.js: si esto falla, se apaga solo,
    // sin arriesgar el motor de bloqueos). Nunca inventa una ficha: solo puede elegir un
    // ID real o "ninguna", igual de blindado que el clasificador de comida.
    if (bloqueosReales.length === 0) {
      const alternativas = await supabaseFetch(
        `alternativas_locales?select=id,mecanismo,descripcion_mecanismo,recomendacion,nivel_evidencia`
      );
      const idElegido = await elegirTipRelevanteIA(texto, alternativas);
      if (idElegido) {
        const elegida = alternativas.find((a) => a.id === idElegido);
        if (elegida) {
          sugerencias.push({
            nombre: elegida.mecanismo || "",
            mecanismo: elegida.descripcion_mecanismo || "",
            opcion: elegida.recomendacion || "",
            evidencia: elegida.nivel_evidencia || "",
          });
        }
      }
    }

    // --- MIS Etapa 1 — Piloto de Instrumentación (DC-05). Único agregado de este archivo. ---
    // No intrusivo: emitirEvento nunca lanza, un fallo interno se loguea y se descarta (Directiva 2).
    // No se emite en modo soloVista: no hubo un registro real que instrumentar.
    if (!soloVista) {
      await emitirEvento({
        usuarioId,
        eventType: "comida_registrada",
        sourceComponent: "registrar-comida",
        requestingComponent: "registrar-comida",
        payload: {
          registroId, bloqueosCount: bloqueos.length, versionCasera,
          iaUsada: Boolean(categoriasIA && categoriasIA.length > 0),
        },
      });

      // Fase 2/P0 (Marketing) — funnel de producto, separado del evento de seguridad
      // de arriba. Mismo criterio no-bloqueante (ver _eventos-producto.js).
      await emitirEventoProducto({
        usuarioId,
        evento: "registro_realizado",
        contexto: alternativaId ? "explorador" : "log_libre",
        metadata: { alternativaId: alternativaId || null, bloqueosCount: bloqueos.length },
      });
    }

    res.status(200).json({ registroId, bloqueos, resueltos: resueltosRespuesta, sugerencias, soloVista: Boolean(soloVista) });
  } catch (err) {
    res.status(500).json({ error: "Error procesando el registro", detail: String(err) });
  }
}
