// Contenido educativo de validación: solo Vercel Preview.
// Los mecanismos se explican sin prometer una respuesta glucémica idéntica para todos.
// Base científica de referencia:
// - Arroz enfriado/recalentado: PMID 26693746; revisión PMID 26310311.
// - Orden de ingesta: PMID 36574255; PMID 41837403 (evidencia prometedora, estudios pequeños).
// Aplicar seguridad alimentaria: enfriar pronto, refrigerar en no más de 1–2 h y recalentar bien.
const COPY = {
  // Arroz blanco con proteína
  "e6297877-84c2-4fc0-a2f3-f44424fe6eab": {
    resumen: "El arroz blanco aporta almidón disponible. La respuesta glucémica depende también de la variedad, la cocción, la porción y con qué lo acompañás; no es igual en todos los platos ni en todas las personas.",
    hack: "Probá dos cambios concretos: empezá por los vegetales y la proteína, y en otra comida compará arroz recién hecho con arroz enfriado rápidamente, refrigerado 12–24 h y recalentado bien. Al enfriarse, parte del almidón se reorganiza y puede volverse almidón resistente; no elimina los carbohidratos.",
    observar: "Mantené parecidas la porción y el resto del plato. Compará hambre y energía durante las 2–3 h siguientes. Si medís glucosa, compará lecturas en condiciones similares: el efecto es variable."
  },
  // Arroz como plato principal
  "f2e386fe-0f28-4c28-9673-1b156348c54e": {
    resumen: "El arroz contiene almidón, pero su respuesta no depende solo de que sea blanco o integral: influyen la variedad, el procesamiento, el punto de cocción, la porción y la composición del plato.",
    hack: "Hack de preparación: cociná el arroz, enfriá la porción rápidamente y guardala en heladera dentro de 1–2 h; después de 12–24 h, recalentala bien. El enfriado puede aumentar el almidón resistente. Para probar el orden de ingesta, comé primero vegetales y proteína, y después el arroz.",
    observar: "No esperes que el arroz deje de elevar la glucosa. Compará porciones similares y registrá saciedad y energía; si usás glucómetro, compará la respuesta en condiciones parecidas."
  },
  // Guiso de arroz
  "5351b0dc-6df4-4a9b-a341-a1ef37421e8f": {
    resumen: "En el guiso, el arroz aporta almidón y la proporción de vegetales, legumbres y proteína cambia la fibra y la composición total. Enfriar el arroz puede aumentar algo el almidón resistente, pero no convierte el plato en bajo en carbohidratos.",
    hack: "Armá el guiso con una presencia visible de vegetales y una fuente de proteína. Si cocinás para guardar, enfriá rápido, refrigerá dentro de 1–2 h y recalentá bien; el enfriado puede favorecer la formación de almidón resistente.",
    observar: "Compará saciedad, energía y comodidad digestiva con tu guiso habitual. Cambiá una sola variable por vez para entender qué te resulta útil."
  },
  // Paella
  "703aa4ef-7263-4b0b-98e9-42e3d590a35a": {
    resumen: "En una paella, la cantidad y variedad de arroz, el punto de cocción y la proporción de vegetales y proteína influyen en la respuesta del plato; el pollo o los mariscos no anulan el almidón.",
    hack: "Dale lugar real a los vegetales y la proteína en la porción. Si preparás arroz con antelación, enfriá rápido, refrigerá dentro de 1–2 h y recalentá bien: el enfriado puede aumentar el almidón resistente, con un efecto variable.",
    observar: "Compará saciedad y energía con una porción parecida. Si medís glucosa, registrá la respuesta en condiciones similares, sin asumir que el cambio tendrá el mismo efecto siempre."
  },
  // Papa / puré
  "9c54539b-5bac-4b79-b95d-65eadbc913ef": {
    resumen: "La papa aporta almidón. Al cocinarla y enfriarla, parte de ese almidón puede reorganizarse y volverse más resistente a la digestión; triturarla, el punto de cocción y agregar manteca o crema también cambian la preparación.",
    hack: "Probá papa hervida en trozos, enfriada en heladera 12–24 h y luego recalentada bien. Acompañala con vegetales y proteína; si querés comparar el efecto del enfriado, mantené iguales la porción y los acompañamientos. No dejes la papa cocida horas a temperatura ambiente.",
    observar: "Compará saciedad, textura y comodidad digestiva. Si medís glucosa, contrastá la misma porción en condiciones similares; el almidón resistente no elimina los carbohidratos ni garantiza una bajada determinada."
  },
  // Pastas integrales vs habituales
  "7093a19e-a8e0-4101-8ae3-66ab68c404b5": {
    resumen: "La pasta al dente suele digerirse más lentamente que la misma pasta muy cocida porque el almidón queda menos accesible. La integral aporta más fibra, aunque el efecto final depende de la porción y de la salsa.",
    hack: "Cociná la pasta al dente siguiendo el tiempo mínimo del paquete y probá una versión integral en otra ocasión. Sumá vegetales y una fuente de proteína; para experimentar con el orden, empezá por esos acompañamientos y después comé la pasta.",
    observar: "Compará textura, saciedad y energía durante las horas siguientes manteniendo parecidas la porción y la salsa. El orden puede atenuar el pico glucémico en algunas personas, pero la evidencia no permite prometer un efecto fijo."
  },
  "6692bd1f-48d8-43dc-8ef5-abe6dfa24dcc": {
    resumen: "En los fideos, el punto de cocción, la cantidad servida y la composición de la salsa influyen en la respuesta. La pasta al dente conserva más estructura; vegetales y proteína completan el plato, no borran el aporte de almidón.",
    hack: "Probá pasta al dente y acompañala con vegetales y proteína. Para comparar el orden, empezá por los vegetales/proteína y seguí con los fideos. En otra comida, cambiá solo a pasta integral y dejá la salsa y la porción similares.",
    observar: "Anotá saciedad, energía y comodidad digestiva. Si medís glucosa, compará la misma comida en condiciones parecidas; el resultado varía según persona, tipo de pasta y preparación."
  },
  // Pizza
  "3150cca4-26fb-4ce2-9ec6-4d34d7b12e0c": {
    resumen: "La masa aporta almidón; el queso suma proteína y grasa, y la cobertura puede aportar vegetales y fibra. La grasa puede retrasar la digestión, pero no neutraliza los carbohidratos ni garantiza una respuesta glucémica menor.",
    hack: "Conservá la pizza: sumá una ensalada o vegetales y empezá por ellos; después comé la pizza. Servite la porción que decidiste antes de empezar y masticá sin apuro. Si hacés pizza casera, probá una masa con parte de harina integral en otra ocasión, sin cambiar todo a la vez.",
    observar: "Compará saciedad, disfrute y comodidad digestiva, y si te resulta más fácil parar cuando estás satisfecho. Si medís glucosa, observá la respuesta real: no deduzcas el pico solo por el aspecto o el tipo de pizza."
  }
};

export function copyPlatoPreview(reglaId) {
  return process.env.VERCEL_ENV === "preview" ? COPY[reglaId] || null : null;
}
