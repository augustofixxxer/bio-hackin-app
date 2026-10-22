// Copy temporal de validación. Solo se activa en Vercel Preview; producción sigue leyendo Supabase.
const COPY = {
  "e6297877-84c2-4fc0-a2f3-f44424fe6eab": {
    resumen: "El arroz aporta la base del plato y el pollo o pescado, la proteína. La cantidad de vegetales y grasa depende de cómo armes la comida.",
    hack: "Sumá una porción de vegetales al arroz con proteína y mantené iguales los demás componentes.",
    observar: "Compará cuánto dura la saciedad, tu energía y la comodidad digestiva después de comer."
  },
  "121855de-106e-4a96-bd4b-a4a3a12bd517": {
    resumen: "En la milanesa napolitana, el rebozado, la cocción y el queso aportan variables distintas; el nombre no indica cuánto aceite ni queso lleva.",
    hack: "Mantené tu napolitana habitual y probá acompañarla con vegetales o ensalada, sin cambiar la receta al mismo tiempo.",
    observar: "Registrá saciedad, comodidad digestiva y cuánto disfrutaste el plato."
  },
  "07e07c30-408b-4893-bcde-1377786095b6": {
    resumen: "En las empanadas, masa, relleno y cocción cambian el resultado; modificar varias cosas juntas impide comparar con claridad.",
    hack: "Mantené masa y relleno, y compará horno frente a fritura en otra ocasión.",
    observar: "Compará crocancia, sabor, saciedad y comodidad digestiva."
  },
  "8c55d9b6-f6c9-4f07-a853-721ee5eab2f6": {
    resumen: "En las empanadas, masa, relleno y cocción cambian el resultado; modificar varias cosas juntas impide comparar con claridad.",
    hack: "Mantené masa y relleno, y compará horno frente a fritura en otra ocasión.",
    observar: "Compará crocancia, sabor, saciedad y comodidad digestiva."
  },
  "f673c93d-baf7-40e3-871c-d0ceb75254f5": {
    resumen: "Los fideos son una parte del guiso; el resto depende de cuánto incluya de verduras, legumbres o carne.",
    hack: "En la próxima olla, aumentá solo un componente —verduras o proteína— y dejá igual la cantidad de fideos.",
    observar: "Compará saciedad, textura y comodidad digestiva con tu guiso habitual."
  },
  "fae93784-451f-48a3-8193-60572595f3f3": {
    resumen: "El perfil de una hamburguesa depende de la carne, el pan, las salsas y los vegetales; «comercial» no permite conocer su composición exacta.",
    hack: "Probá una hamburguesa casera de tamaño similar con carne, pan integral, tomate y hojas verdes; mantené estable el resto de la comida.",
    observar: "Compará sabor, saciedad y comodidad digestiva con tu opción habitual."
  },
  "4b34218e-89ce-4f4c-a85c-537496a5d71f": {
    resumen: "El pan, la carne y los acompañamientos definen la composición de la hamburguesa; no todas las versiones son iguales.",
    hack: "Armá una versión con pan integral, carne y tomate, hojas verdes o cebolla; cambiá solo esa estructura respecto de tu versión habitual.",
    observar: "Compará gusto, saciedad y comodidad digestiva."
  },
  "df100620-4f8d-45a8-8d3a-e509820f20d5": {
    resumen: "La humita tiene el maíz como base; el queso, la leche y la grasa cambian la composición según la receta.",
    hack: "Mantené tu humita habitual y acompañala con ensalada o vegetales, sin modificar también la receta.",
    observar: "Compará cuánto dura la saciedad y cómo te resulta la digestión."
  },
  "78066482-c40e-479f-abd0-5e96f205bfc7": {
    resumen: "El locro combina maíz, legumbres y carnes; la proporción de chorizo y panceta influye en la composición y en la pesadez percibida.",
    hack: "Probá reducir el chorizo de 30 g a 15 g y reemplazar esos 15 g por vacuno magro hervido; dejá igual el resto.",
    observar: "Compará saciedad, pesadez y comodidad digestiva con tu locro habitual."
  },
  "a6b78a88-1960-49c7-8533-71f8b3cbd2dd": {
    resumen: "Milanesa y papas fritas comparten el método de cocción; cambiarlo modifica la preparación de ambos componentes.",
    hack: "Probá hacer la milanesa y las papas al horno o por convección con poco aceite; mantené las porciones y el rebozado.",
    observar: "Compará textura, sabor, saciedad y comodidad digestiva frente a la versión frita."
  },
  "ec985b58-bf9e-4845-873e-16584ea402a9": {
    resumen: "En una milanesa, la cocción y el rebozado son variables distintas; para saber cuál preferís, conviene probarlas por separado.",
    hack: "Hacé la misma milanesa al horno o en freidora de aire con una capa fina de aceite; mantené corte, rebozado y acompañamiento.",
    observar: "Compará crocancia, sabor, saciedad y comodidad digestiva."
  },
  "2ad990b9-da32-4c87-bfcd-5124e58e5257": {
    resumen: "Una milanesa puede variar por su cocción, rebozado y acompañamiento; el nombre solo no permite anticipar cómo te resultará.",
    hack: "Compará la misma milanesa al horno y frita en ocasiones distintas, manteniendo iguales el corte y el acompañamiento.",
    observar: "Anotá qué versión preferís por sabor, crocancia, saciedad y comodidad."
  },
  "dad8547d-f1b1-4ad7-a527-31e6e5be9249": {
    resumen: "Los ñoquis aportan la base de papa y harina; la salsa y el acompañamiento completan el plato.",
    hack: "Mantené los ñoquis y probá una salsa de tomate con vegetales; sumá proteína aparte si tu comida suele quedar corta en ese componente.",
    observar: "Compará saciedad, energía percibida y comodidad digestiva después de comer."
  },
  "9c54539b-5bac-4b79-b95d-65eadbc913ef": {
    resumen: "La papa puede servirse hervida, al horno o en puré; la preparación cambia textura y los agregados que terminan en el plato.",
    hack: "Compará papa hervida con cáscara y puré, dejando iguales el resto de la comida y los agregados que uses.",
    observar: "Compará textura, gusto, saciedad y comodidad digestiva."
  },
  "a26af699-10cb-4a02-9bfe-ae1505636b95": {
    resumen: "En los canelones, la masa, el relleno y la salsa aportan partes distintas; no hace falta cambiar todo para comparar.",
    hack: "Mantené la masa y cambiá solo el relleno o la salsa en la próxima preparación.",
    observar: "Compará sabor, saciedad, comodidad digestiva y facilidad de preparación."
  },
  "7093a19e-a8e0-4101-8ae3-66ab68c404b5": {
    resumen: "Con la misma salsa, cambiar el tipo de pasta permite comparar una sola variable del plato.",
    hack: "Probá fideos integrales en lugar de los habituales y mantené iguales la salsa, el queso y la porción.",
    observar: "Compará textura, saciedad, energía percibida y comodidad digestiva."
  },
  "6692bd1f-48d8-43dc-8ef5-abe6dfa24dcc": {
    resumen: "Con la misma salsa, cambiar el tipo de pasta permite comparar una sola variable del plato.",
    hack: "Probá fideos integrales en lugar de los habituales y mantené iguales la salsa, el queso y la porción.",
    observar: "Compará textura, saciedad, energía percibida y comodidad digestiva."
  },
  "3150cca4-26fb-4ce2-9ec6-4d34d7b12e0c": {
    resumen: "En la pizza, la masa, la cobertura y la cantidad de porciones cambian el plato; no hay una única versión que describa a todas.",
    hack: "Si tu pizza ya lleva vegetales, compará masa habitual e integral manteniendo iguales la salsa y la cobertura.",
    observar: "Compará textura, disfrute, saciedad y comodidad digestiva."
  },
  "eed41edb-895b-4040-9905-ad618a2f2cbf": {
    resumen: "El pollo aporta proteína y los fideos, la base de pasta; la salsa y los acompañamientos completan el plato.",
    hack: "Mantené pollo y fideos, y cambiá solo la salsa o la cantidad de vegetales en una próxima comida.",
    observar: "Compará sabor, saciedad y comodidad digestiva."
  },
  "f99a42ed-10d9-4e62-af28-634599cfb33c": {
    resumen: "Los ravioles ya combinan masa y relleno; la salsa y el queso completan la preparación.",
    hack: "Mantené el tipo de ravioles y el queso, y compará dos cantidades de salsa en porciones similares.",
    observar: "Compará sabor, saciedad y comodidad digestiva."
  },
  "5608bc0b-8943-43fd-86da-b6cefb72234c": {
    resumen: "En una tarta, la masa, el relleno y el acompañamiento definen el conjunto; una tarta con poco relleno no equivale a una con más vegetales y proteína.",
    hack: "Elegí una tarta con más relleno de vegetales y proteína y acompañala con ensalada; cambiá una sola cosa si ya hacés ese ajuste.",
    observar: "Compará saciedad, sabor y comodidad digestiva con tu versión habitual."
  },
  "8b28fb02-9af0-4039-a4f2-3683790bf11c": {
    resumen: "En una tarta, la masa, el relleno y el acompañamiento definen el conjunto; una tarta con poco relleno no equivale a una con más vegetales y proteína.",
    hack: "Elegí una tarta con más relleno de vegetales y proteína y acompañala con ensalada; cambiá una sola cosa si ya hacés ese ajuste.",
    observar: "Compará saciedad, sabor y comodidad digestiva con tu versión habitual."
  }
};

export function copyPlatoPreview(reglaId) {
  return process.env.VERCEL_ENV === "preview" ? COPY[reglaId] || null : null;
}
