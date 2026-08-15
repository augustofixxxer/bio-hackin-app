// api/_eventos-producto.js
// Fase 2/P0 (Marketing, 15/08/2026) — funnel de producto: Exploración→Contenido→Hack→
// Prueba→Registro→Feedback→Repetición→Patrón→Intención Premium→Conversión Premium.
//
// Deliberadamente separado de api/_instrumentacion.js (dominio de seguridad/auditoría
// ST-02B/MAS) — Resolución del Fundador: no cruzar ni reutilizar silenciosamente los
// propósitos de ambas instrumentaciones.
//
// Regla crítica de UX (Resolución del Fundador): observacional, nunca bloqueante. Si el
// INSERT falla, nunca debe romper ni condicionar el flujo funcional del endpoint que lo
// llama — por eso esta función nunca lanza (throw) hacia quien la invoca.
import { supabaseFetch } from "./_supabase.js";

const EVENTOS_VALIDOS = [
  "exploracion_iniciada", "contenido_visto", "hack_visto", "probar_click",
  "registro_realizado", "feedback_realizado", "segunda_observacion",
  "patron_visto", "premium_intent", "premium_conversion",
];

// Validación estricta contra los 10 valores permitidos — no acepta eventos arbitrarios
// desde el frontend (Resolución del Fundador).
export async function emitirEventoProducto({ usuarioId, evento, contexto, metadata }) {
  if (!EVENTOS_VALIDOS.includes(evento)) return;
  try {
    await supabaseFetch(`eventos_producto`, {
      method: "POST",
      body: JSON.stringify({
        ...(usuarioId ? { usuario_id: usuarioId } : {}),
        evento,
        ...(contexto ? { contexto: String(contexto) } : {}),
        ...(metadata ? { metadata } : {}),
      }),
    });
  } catch (e) {
    // Silencioso a propósito — analytics nunca puede romper el flujo principal.
  }
}
// END: /api/_eventos-producto.js
