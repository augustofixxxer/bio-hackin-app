// Selector de píldoras por intención: una propuesta alimentaria y una de actividad.
// No redacta contenido ni inventa recomendaciones: solo selecciona fichas existentes.
const ACTIVIDAD = new Set(["Protocolo"]);

function puntuar(a) {
  let p = Number(a.prioridadBusqueda || 0);
  if (a.rolComercial === "hack") p += 10;
  return p;
}

function seleccionarPildoras(entradas, intent) {
  const candidatas = (entradas || []).filter((a) => a.intencionPrincipal === intent);
  const alimento = candidatas.filter((a) => !ACTIVIDAD.has(a.tipo)).sort((a,b) => puntuar(b) - puntuar(a))[0] || null;
  const actividad = candidatas.filter((a) => ACTIVIDAD.has(a.tipo)).sort((a,b) => puntuar(b) - puntuar(a))[0] || null;
  return { alimento, actividad };
}

export { seleccionarPildoras };