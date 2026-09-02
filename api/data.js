// Función serverless (Vercel). Corre en el servidor, nunca en el navegador del usuario.
// Alimenta el "Explorador": trae SOLO Alternativas Locales (técnicas, protocolos y
// reemplazos regionales) — herramientas reutilizables, no atadas a un alimento puntual.
//
// CAMBIO ESTRUCTURAL 31/07/2026 (decisión del Fundador): las Reglas (alimentos puntuales
// con problema, ej. "Vainilla comercial: azúcar sin control") YA NO se muestran acá.
// Quedan 100% reactivas — solo aparecen al registrar o planificar una comida real. Mostrarlas
// en un catálogo para hojear las convertía, por diseño, en una lista infinita de "alimentos
// prohibidos" — exactamente lo que esta app no quiere ser. Las Alternativas Locales, en
// cambio, son un conjunto finito de herramientas (hoy 68), coherente con la identidad de
// "hackeo" de la app.

import { emitirEventoProducto } from "./_eventos-producto.js";
import { usuarioIdDesdeRequest } from "./_sesion.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function supabaseFetch(path) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
  });
  const text = await resp.text();
  const data = text ? JSON.parse(text) : null;
  if (!resp.ok) {
    throw new Error((data && (data.message || data.error)) || `Supabase respondió ${resp.status}`);
  }
  return data;
}

export default async function handler(req, res) {
  // Fase 2/P0 (Marketing, 15/08/2026) — instrumentación de funnel de producto (P0.17-19).
  // Reutiliza este endpoint (ya se llama al cargar el Explorador) en vez de crear uno
  // nuevo — Resolución del Fundador. Observacional: siempre responde 200, incluso si el
  // INSERT interno falló (ver api/_eventos-producto.js) — nunca debe bloquear al cliente.
  if (req.method === "POST") {
    const { evento, contexto, metadata } = req.body || {};
    const usuarioId = usuarioIdDesdeRequest(req);
    await emitirEventoProducto({ usuarioId, evento, contexto, metadata });
    res.status(200).json({ ok: true });
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    res.status(500).json({
      error: "Falta configurar SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY como variable de entorno en Vercel.",
    });
    return;
  }

  try {
    const alternativas = await supabaseFetch(
      `alternativas_locales?select=id,mecanismo,descripcion_mecanismo,recomendacion,frecuencia_dosis,compuesto_activo,tipo,objetivo,nivel_evidencia,tipo_card,badge_principal,tag_frio_calor,orden_prioridad,intencion_principal_id,intenciones_secundarias,familia_key,prioridad_busqueda,estado_curado`
    );
    const intenciones = await supabaseFetch(`intenciones?select=id,clave`);
    const claveDeIntencion = Object.fromEntries(intenciones.map((i) => [i.id, i.clave]));

    const entradas = alternativas.map((a) => {
      const esProtocolo = a.tipo === "Protocolo";
      return {
        id: a.id,
        tipo: esProtocolo ? "protocolo" : "alternativa",
        combinacion: a.mecanismo || "",
        resultado: a.recomendacion || "",
        mecanismo: a.descripcion_mecanismo || null,
        frecuencia: a.frecuencia_dosis || null,
        nutriente: a.compuesto_activo || null,
        categorias: a.objetivo || [],
        evidencia: a.nivel_evidencia || null,
        tipo_card: a.tipo_card || null,
        badge_principal: a.badge_principal || null,
        tag_frio_calor: a.tag_frio_calor || null,
        orden_prioridad: a.orden_prioridad ?? null,
        intencionPrincipal: claveDeIntencion[a.intencion_principal_id] || null,
        intencionesSecundarias: (a.intenciones_secundarias || []).map((id) => claveDeIntencion[id]).filter(Boolean),
        familia: a.familia_key || null,
        prioridadBusqueda: a.prioridad_busqueda || 0,
        estadoCurado: a.estado_curado || null,
      };
    });

    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=300");
    res.status(200).json({
      entradas,
      actualizado: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: "Error consultando Supabase", detail: String(err) });
  }
}
// END: /api/data.js
