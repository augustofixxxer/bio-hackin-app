// api/_test-borrado.mjs
// Prueba de comportamiento del borrado, sin red ni Supabase real (base y email simulados).
// Prefijo "_": Vercel no lo cuenta como función. Ejecutar: node api/_test-borrado.mjs
import { createHash } from "crypto";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const aqui = dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), "borrado-"));
mkdirSync(join(tmp, "api"));
for (const f of ["borrar-datos.js", "_confirmar-borrado.js"]) copyFileSync(join(aqui, f), join(tmp, "api", f));
writeFileSync(join(tmp, "package.json"), '{"type":"module"}');
writeFileSync(join(tmp, "api", "_supabase.js"), 'export const SUPABASE_URL="x",SUPABASE_KEY="y";export async function supabaseFetch(p,o={}){return globalThis.__db(p,o)}');
writeFileSync(join(tmp, "api", "_sesion.js"), 'export const usuarioIdDesdeRequest=(req)=>req.headers?.["x-user"]||null;');
writeFileSync(join(tmp, "api", "_instrumentacion.js"), 'export const emitirEvento=async(e)=>{(globalThis.__ev??=[]).push(e.eventType)};');
const { default: handler } = await import(pathToFileURL(join(tmp, "api", "borrar-datos.js")).href);

let users, sol, rpcCalls, borrados;
const reset = () => { users = [{ id: "u1", email: "a@b.com" }]; sol = []; rpcCalls = 0; borrados = 0; globalThis.__ev = []; };
globalThis.__db = async (p, o = {}) => {
  const body = o.body ? JSON.parse(o.body) : null, m = o.method || "GET";
  if (p.startsWith("usuarios?id=")) return users.filter(u => p.includes("eq." + u.id));
  if (p.startsWith("usuarios?email=")) return users.filter(u => p.includes(encodeURIComponent(u.email)));
  if (p.startsWith("solicitudes_borrado?usuario_id=")) return sol.filter(s => s.estado === "pendiente" && Date.now() - s.t < 15 * 60e3).map(() => ({ id: 1 }));
  if (p === "solicitudes_borrado" && m === "POST") { sol.push({ ...body, t: Date.now() }); return null; }
  if (p.startsWith("solicitudes_borrado?token_hash=")) {
    const h = p.match(/eq\.([a-f0-9]{64})/)[1];
    if (m === "PATCH") { sol.filter(s => s.token_hash === h && s.estado === "pendiente").forEach(s => s.estado = body.estado); return null; }
    return sol.filter(s => s.token_hash === h);
  }
  if (p === "rpc/confirmar_solicitud_borrado") {
    rpcCalls++; const s = sol.find(s => s.token_hash === body.p_token_hash);
    if (!s) return [{ resultado: "invalida" }];
    if (s.estado !== "pendiente") return [{ resultado: "ya_usada" }];
    if (new Date(s.expira_en) <= Date.now()) { s.estado = "expirada"; return [{ resultado: "expirada" }]; }
    s.estado = "completada"; users = users.filter(u => u.id !== s.usuario_id); borrados++; return [{ resultado: "completada" }];
  }
  if (p === "rpc/borrar_usuario_autenticado") {
    const n = users.length; users = users.filter(u => u.id !== body.p_usuario_id);
    if (users.length < n) { borrados++; return true; } return false;
  }
  throw new Error("ruta no prevista " + p);
};
const mk = (method, { query = {}, body, headers = {} } = {}) => {
  const r = { code: 0, json: null, text: null, h: {} };
  const res = { status(c) { r.code = c; return res; }, json(j) { r.json = j; return res; }, send(t) { r.text = t; return res; }, setHeader(k, v) { r.h[k] = v; } };
  return [{ method, query, body, headers }, res, r];
};
const run = async (...a) => { const [req, res, r] = mk(...a); await handler(req, res); return r; };
const out = []; let fallos = 0;
const ok = (n, c) => { if (!c) fallos++; out.push(`${c ? "PASS" : "FAIL"}  ${n}`); };
process.env.RESEND_API_KEY = "k"; process.env.BORRADO_EMAIL_FROM = "f@x.com"; process.env.APP_BASE_URL = "https://app.test";
let sent = [], mailOk = true;
globalThis.fetch = async (u, o) => { sent.push(JSON.parse(o.body)); return { ok: mailOk, status: mailOk ? 200 : 500 }; };
const tokenDe = () => decodeURIComponent(sent.at(-1).text.match(/token=([A-Za-z0-9_%-]+)/)[1]);

// --- Borrado CON sesión: confirmación explícita obligatoria ---
reset(); let r = await run("POST", { body: { email: "a@b.com" }, headers: { "x-user": "u1" } });
ok("con sesión SIN confirmacion: 400, no borra, no llama a la RPC", r.code === 400 && r.json.requiere_confirmacion === true && borrados === 0 && users.length === 1);
reset(); r = await run("POST", { body: { email: "a@b.com", confirmacion: "eliminar" }, headers: { "x-user": "u1" } });
ok("con sesión y confirmacion en minúsculas: 400, no borra", r.code === 400 && borrados === 0 && users.length === 1);
reset(); r = await run("POST", { body: { email: "a@b.com", confirmacion: "SI" }, headers: { "x-user": "u1" } });
ok("con sesión y confirmacion incorrecta: 400, no borra", r.code === 400 && borrados === 0);
reset(); r = await run("POST", { body: { email: "otro@b.com", confirmacion: "ELIMINAR" }, headers: { "x-user": "u1" } });
ok("con sesión, confirmacion correcta pero email ajeno: 403, no borra", r.code === 403 && borrados === 0 && users.length === 1);
reset(); r = await run("POST", { body: { email: "A@b.com", confirmacion: "ELIMINAR" }, headers: { "x-user": "u1" } });
ok("con sesión, confirmacion ELIMINAR y email propio: borra", r.code === 200 && borrados === 1 && users.length === 0);

// --- Borrado por email (sin sesión) ---
reset(); sent = []; r = await run("POST", { body: { email: "nadie@b.com" } });
ok("email sin cuenta: respuesta genérica, sin solicitud ni mail", r.code === 200 && r.json.modo === "verificacion_pendiente" && sol.length === 0 && sent.length === 0);
reset(); sent = []; await run("POST", { body: { email: "a@b.com" } }); const n1 = sent.length;
r = await run("POST", { body: { email: "a@b.com" } });
ok("solicitud pendiente reciente: no genera 2.º token ni mail", r.code === 200 && sol.length === 1 && sent.length === n1 && n1 === 1);
const tok = tokenDe();
ok("solo se guarda el hash SHA-256 del token", sol[0].token_hash === createHash("sha256").update(tok).digest("hex") && !JSON.stringify(sol).includes(tok));
r = await run("GET", { query: { accion: "confirmar", token: tok } });
ok("GET del enlace: muestra la pantalla y NO borra", r.code === 200 && /Confirmar eliminación definitiva/.test(r.text) && borrados === 0 && rpcCalls === 0 && users.length === 1);
r = await run("GET", { query: { token: tok } });
ok("GET a /api/borrar-datos sin accion: 405", r.code === 405);
r = await run("POST", { query: { accion: "confirmar" }, body: { token: tok } });
ok("token válido por POST: borra", r.code === 200 && borrados === 1 && users.length === 0 && sol[0].estado === "completada");
r = await run("POST", { query: { accion: "confirmar" }, body: { token: tok } });
ok("token reutilizado: rechazado, no borra otra cuenta", r.code === 400 && borrados === 1);
reset(); sent = []; await run("POST", { body: { email: "a@b.com" } }); const t2 = tokenDe(); sol[0].expira_en = new Date(Date.now() - 1000).toISOString();
r = await run("POST", { query: { accion: "confirmar" }, body: { token: t2 } });
ok("token vencido: rechazado y marcado expirada", r.code === 400 && borrados === 0 && sol[0].estado === "expirada" && users.length === 1);
r = await run("POST", { query: { accion: "confirmar" }, body: { token: "A".repeat(43) } });
ok("token inexistente: rechazado", r.code === 400 && borrados === 0);
r = await run("POST", { query: { accion: "confirmar" }, body: { token: "x" } });
ok("token con formato inválido: rechazado", r.code === 400);
reset(); sent = []; mailOk = false; r = await run("POST", { body: { email: "a@b.com" } });
ok("fallo de envío de email: 503 y solicitud cancelada", r.code === 503 && sol[0].estado === "cancelada" && users.length === 1);
mailOk = true;
r = await run("PUT", { query: { accion: "confirmar" } });
ok("método no permitido en confirmar: 405", r.code === 405);

console.log(out.join("\n"));
console.log(fallos ? `\n${fallos} prueba(s) FALLARON` : `\nTodas las pruebas pasaron (${out.length})`);
process.exit(fallos ? 1 : 0);
