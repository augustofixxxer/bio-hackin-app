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

// Motor de invitación Premium contextual — Directiva "Refactor de Píldoras Premium".
// Puntos 2 y 11: variable_modificada y categoria son metadato de clasificación/contexto,
// NUNCA sustituto de la acción concreta en el texto del CTA -- viajan aparte (para
// instrumentación / continuidad hacia Premium), no se redactan dentro de la frase.
// El texto ancla al caso concreto que el usuario ya tiene arriba en la misma tarjeta
// (combinacion + resultado), sin nombrar una categoría abstracta ni revelar la técnica.
function construirInvitacionPremium() {
  return "Esto se puede experimentar de distintas maneras. ¿Querés probar el cómo? Premium te guía con una opción concreta para esta comida.";
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

    // 1. Traer las Reglas con su Solución ya embebida (join nativo de Supabase, en un solo viaje).
    // Incluye nivel_acceso (de la regla), categoria/variable_modificada (metadato) y los 4
    // campos estructurados para la píldora en capas -- todos necesarios para la separación
    // Free/Premium y el modelo de píldora vigentes.
    const reglas = await supabaseFetch(
      `reglas?select=id,combinacion,resultado,palabras_clave,nivel_riesgo,nivel_acceso,momento_requerido,palabras_excluyentes,familia_key,prioridad_motor,soluciones(nombre_hackeo,adaptacion,variable_modificada,categoria,accion_usuario,observacion_usuario,contexto_activacion,continuidad)`
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

    // INTENT ENGINE — PRECEDENCIA REAL (14/09/2026)
    // La identidad del plato se resuelve antes que los patrones transversales.
    // familia_key + prioridad_motor son criterios reales del motor.
    const especificidad = (r) => ((r.palabras_clave || "").includes(";") ? 1 : 0);
    const prioridadMotor = (r) => Number.isFinite(Number(r.prioridad_motor)) ? Number(r.prioridad_motor) : 0;
    const tieneFamilia = (r) => Boolean((r.familia_key || "").trim());
    const longitudClave = (r) => {
      const claves = (r.palabras_clave || "").replace(/^tip:/i, "").trim()
        .split(/[;,]/).map((k) => normalizar(k.trim())).filter(Boolean);
      let mejor = 0;
      for (const clave of claves) {
        if (contienePalabraCompleta(textoParaMatching, clave)) mejor = Math.max(mejor, clave.length);
      }
      return mejor;
    };
    const riesgoRank = (r) => (r.nivel_riesgo === "Alto" ? 0 : r.nivel_riesgo === "Medio" ? 1 : 2);
    function posicionMatch(r) {
      const claves = (r.palabras_clave || "").replace(/^tip:/i, "").trim()
        .split(/[;,]/).map((k) => normalizar(k.trim())).filter(Boolean);
      let mejor = Infinity;
      for (const clave of claves) {
        const m = new RegExp(`\\b${escapeRegex(clave)}\\b`).exec(textoParaMatching);
        if (m && m.index < mejor) mejor = m.index;
      }
      return mejor;
    }
    function ordenarPorPrecedencia(lista) {
      return [...lista].sort((a, b) => {
        const familiaDiff = Number(tieneFamilia(b)) - Number(tieneFamilia(a));
        if (familiaDiff !== 0) return familiaDiff;
        const prioridadDiff = prioridadMotor(b) - prioridadMotor(a);
        if (prioridadDiff !== 0) return prioridadDiff;
        const claveDiff = longitudClave(b) - longitudClave(a);
        if (claveDiff !== 0) return claveDiff;
        const espDiff = especificidad(a) - especificidad(b);
        if (espDiff !== 0) return espDiff;
        const riesgoDiff = riesgoRank(a) - riesgoRank(b);
        if (riesgoDiff !== 0) return riesgoDiff;
        return posicionMatch(a) - posicionMatch(b);
      });
    }
    const coincidenciasOrdenadas = ordenarPorPrecedencia(coincidencias);
    const coincidenciasTipOrdenadas = ordenarPorPrecedencia(coincidenciasTip).slice(0, 2);

    // 2b. Si el texto indica versión casera, esas coincidencias quedan "resueltas"
    // (ya se aplicó el hackeo) y no se tratan como bloqueo real.
    // Límite de salida (P0, sección 8): máximo 2 bloqueos mostrados — el principal según
    // el orden de arriba, y como mucho un segundo.
    const bloqueosReales = versionCasera ? [] : coincidenciasOrdenadas.slice(0, 2);
    const resueltos = versionCasera ? coincidenciasOrdenadas : [];

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

    // 5. Armar bloqueos reales. Directiva "Refactor de Píldoras Premium":
    //   REGLA GRATUITA: solo hallazgo/estado; si existe solución, invita a Premium.
    //   REGLA PREMIUM + usuario no-Premium: hallazgo/estado + invitación contextual.
    //   REGLA PREMIUM + usuario Premium: adaptación completa, en capas (armarSolucion) si
    //     accion_usuario/observacion_usuario/contexto_activacion/continuidad ya están
    //     curados; si no, bloque único con adaptacion completa (punto 7: nunca se arma la
    //     separación por lógica creativa en JS, se espera la curaduría en la fuente).
    const esPremiumComida = nivelAcceso === "Premium";
    function armarSolucion(soluciones, reglaEsPremium) {
      if (!soluciones) return null;
      return {
        nombre: soluciones.nombre_hackeo || "",
        adaptacion: soluciones.adaptacion || "",
        accionUsuario: soluciones.accion_usuario || null,
        observacionUsuario: soluciones.observacion_usuario || null,
        contextoActivacion: soluciones.contexto_activacion || null,
        continuidad: soluciones.continuidad || null,
        premium: reglaEsPremium,
      };
    }
    const bloqueos = bloqueosReales.map((r, i) => {
      const reglaEsPremium = r.nivel_acceso === "Premium";
      // Fase 3 — frontera Free/Premium: la tarjeta gratuita entrega solo el hallazgo/estado.
      // La acción, observación de prueba y continuidad quedan reservadas a Premium.
      const puedeVerAdaptacion = Boolean(r.soluciones) && esPremiumComida;
      const debeInvitarAPremium = Boolean(r.soluciones) && !esPremiumComida;
      return {
        combinacion: r.combinacion || "",
        resultado: r.resultado || "",
        nivelRiesgo: r.nivel_riesgo || "Bajo",
        solucion: puedeVerAdaptacion ? armarSolucion(r.soluciones, reglaEsPremium) : null,
        invitacionPremium: debeInvitarAPremium
          ? {
              texto: construirInvitacionPremium(),
              variable: r.soluciones.variable_modificada || null,
              categoria: r.soluciones.categoria || null,
            }
          : null,
        bloqueoId: bloqueosCreados[i]?.id,
      };
    });

    // 6. Armar resueltos (versión casera) como refuerzo positivo, sin crear Bloqueo.
    // Misma regla de separación de la sección 5: en Free no se revela la solución,
    // independientemente del nivel de acceso de la regla.
    const resueltosRespuesta = resueltos.map((r) => {
      const reglaEsPremium = r.nivel_acceso === "Premium";
      const puedeVerAdaptacion = Boolean(r.soluciones) && esPremiumComida;
      return {
        combinacion: r.combinacion || "",
        mensaje: "Ya aplicaste este hackeo con la versión casera.",
        solucion: puedeVerAdaptacion ? armarSolucion(r.soluciones, reglaEsPremium) : null,
      };
    });

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
