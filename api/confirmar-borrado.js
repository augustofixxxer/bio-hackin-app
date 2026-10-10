// api/confirmar-borrado.js
// El GET solo muestra una confirmación humana; el borrado ocurre exclusivamente por POST.
import { createHash } from "crypto";
import { emitirEvento } from "./_instrumentacion.js";
import { supabaseFetch, SUPABASE_URL, SUPABASE_KEY } from "./_supabase.js";

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function paginaConfirmacion(token) {
  const seguro = token.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Confirmar eliminación — Reseteo Propio</title><body style="font-family:system-ui;max-width:560px;margin:12vh auto;padding:24px;line-height:1.5"><h1>Confirmar eliminación</h1><p>Esta acción elimina permanentemente tu cuenta y los datos asociados. No se puede deshacer.</p><button id="confirmar" style="padding:14px 18px;font-size:1rem">Confirmar eliminación definitiva</button><p id="estado" role="status"></p><script>
const token = "${seguro}";
history.replaceState(null,"",location.pathname);
document.getElementById("confirmar").addEventListener("click",async()=>{
 const b=document.getElementById("confirmar"),s=document.getElementById("estado");
 if(!confirm("¿Confirmás la eliminación permanente de tu cuenta y datos?"))return;
 b.disabled=true;s.textContent="Procesando…";
 try{const r=await fetch("/api/confirmar-borrado",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token})});const d=await r.json();s.textContent=d.mensaje||d.error||"No se pudo completar la solicitud.";if(r.ok)b.textContent="Eliminación confirmada";else b.disabled=false;}catch(e){s.textContent="No se pudo conectar. Intentá de nuevo.";b.disabled=false;}
});
</script></body></html>`;
}

export default async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: "Falta configurar Supabase." });
  if (req.method === "GET") {
    const token = req.query?.token;
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{40,60}$/.test(token)) return res.status(400).send("Enlace inválido o vencido.");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(paginaConfirmacion(token));
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  const token = req.body?.token;
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{40,60}$/.test(token)) return res.status(400).json({ error: "Enlace inválido o vencido." });

  try {
    const tokenHash = hashToken(token);
    const solicitudes = await supabaseFetch(`solicitudes_borrado?token_hash=eq.${tokenHash}&select=usuario_id,estado,expira_en&limit=1`);
    if (!solicitudes.length) return res.status(400).json({ error: "El enlace es inválido o venció." });
    if (solicitudes[0].estado !== "pendiente") return res.status(400).json({ error: "Este enlace ya fue utilizado o cancelado." });
    if (new Date(solicitudes[0].expira_en).getTime() <= Date.now()) {
      await supabaseFetch(`solicitudes_borrado?token_hash=eq.${tokenHash}&estado=eq.pendiente`, { method: "PATCH", body: JSON.stringify({ estado: "expirada" }) });
      return res.status(400).json({ error: "El enlace venció. Volvé a solicitar la eliminación." });
    }

    // Registrar trazabilidad antes del borrado: el vínculo de sujeto se elimina durante la transacción.
    await emitirEvento({ usuarioId: solicitudes[0].usuario_id, eventType: "borrado_datos_confirmado", sourceComponent: "confirmar-borrado", requestingComponent: "confirmar-borrado", payload: { metodo: "email" } });

    // RPC bloquea la fila y consume el token de forma atómica antes del borrado.
    const result = await supabaseFetch("rpc/confirmar_solicitud_borrado", {
      method: "POST", body: JSON.stringify({ p_token_hash: tokenHash }),
    });
    const estado = result?.[0]?.resultado;
    if (estado === "ya_usada") return res.status(400).json({ error: "Este enlace ya fue utilizado." });
    if (estado === "expirada") return res.status(400).json({ error: "El enlace venció. Volvé a solicitar la eliminación." });
    if (estado !== "completada") return res.status(400).json({ error: "El enlace es inválido o venció." });

    return res.status(200).json({ ok: true, mensaje: "La eliminación fue confirmada y la cuenta se borró permanentemente." });
  } catch (error) {
    console.error("Error confirmando el borrado:", error);
    return res.status(500).json({ error: "No se pudo completar la eliminación. Volvé a intentarlo." });
  }
}
