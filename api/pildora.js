import { supabaseFetch, SUPABASE_URL, SUPABASE_KEY } from './_supabase.js';
import { usuarioIdDesdeRequest } from './_sesion.js';

const INTRO = {
  energia: 'Sentirte sin energía puede tener más de una explicación: descanso, actividad, hidratación o cómo quedó armada una comida. En vez de adivinar, la app te propone pruebas concretas para descubrir qué cambia en vos.',
  descanso_sueno: 'Dormir mal no siempre depende de una sola cosa. Podemos probar cambios sencillos en alimentación y actividad, y mirar qué pasa en tus noches.',
  digestion: 'La pesadez o la hinchazón pueden aparecer por distintas razones. La app te ayuda a probar cambios concretos en comidas y movimiento y comparar cómo te sentís.',
  foco_concentracion: 'Cuando cuesta sostener la atención, una comida o una pausa de movimiento pueden ser un buen punto de partida. La idea es probar y observar, no adivinar una causa única.',
  hambre_saciedad: 'Llegar con hambre demasiado pronto puede estar relacionado con cómo fue la comida, el momento del día o lo que hacés después. Podemos probar una cosa concreta y comparar.',
  entrenamiento: 'Cómo llegás a entrenar puede cambiar según la comida y el movimiento previo. La app te propone una prueba de cada lado para que descubras qué te resulta más práctico.',
  recuperacion: 'Después de entrenar, la experiencia puede cambiar según lo que comés y lo que hacés después. Probemos una opción de alimentación y otra de actividad para comparar.',
};

export default async function handler(req,res){
  if(req.method!=='GET'){res.status(405).json({error:'Método no permitido.'});return;}
  if(!SUPABASE_URL||!SUPABASE_KEY){res.status(500).json({error:'Servicio no configurado.'});return;}
  const intent=String(req.query?.intent||'').trim();
  if(!intent){res.status(400).json({error:'Falta la situación.'});return;}
  try{
    const usuarioId = usuarioIdDesdeRequest(req);
    let esPremium = false;
    if (usuarioId) {
      const usuarios = await supabaseFetch(`usuarios?id=eq.${encodeURIComponent(usuarioId)}&select=nivel_acceso,cuenta_suspendida,terminos_aceptados`);
      const u = usuarios?.[0];
      if (!u || u.cuenta_suspendida === true || u.terminos_aceptados !== true) {
        return res.status(403).json({error:'Acceso no disponible.'});
      }
      esPremium = u.nivel_acceso === 'Premium';
    }
    const ints=await supabaseFetch(`intenciones?select=id&clave=eq.${encodeURIComponent(intent)}`);
    const id=ints?.[0]?.id;
    const all=id?await supabaseFetch(`alternativas_locales?select=id,mecanismo,descripcion_mecanismo,recomendacion,tipo,tipo_card,badge_principal,objetivo,accion_texto,observacion_texto,continuidad_texto,rol_comercial,prioridad_busqueda,estado_curado,intencion_principal_id&intencion_principal_id=eq.${id}`):[];
    const score=a=>(Number(a.prioridad_busqueda)||0)+(a.rol_comercial==='hack'?10:0);
    const food=all.filter(a=>a.tipo!=='Protocolo').sort((a,b)=>score(b)-score(a))[0]||null;
    const activity=all.filter(a=>a.tipo==='Protocolo').sort((a,b)=>score(b)-score(a))[0]||null;
    const preparar = (a) => {
      if (!a) return null;
      if (esPremium) return a;
      // Free: hallazgo/estado útil, sin revelar hack, observación ni continuidad.
      return {
        id:a.id, mecanismo:a.mecanismo, descripcion_mecanismo:a.descripcion_mecanismo,
        tipo:a.tipo, tipo_card:a.tipo_card, badge_principal:a.badge_principal,
        objetivo:a.objetivo, estado_curado:a.estado_curado, premium:true
      };
    };
    res.setHeader('Cache-Control','private, no-store');
    res.status(200).json({
      intent,
      intro:INTRO[intent]||'Hay más de una forma de mirar esta situación. La app te propone pruebas concretas para descubrir qué te resulta útil.',
      premium:esPremium,
      food:preparar(food),
      activity:preparar(activity)
    });
  }catch(err){res.status(500).json({error:'No pudimos cargar esta situación.',detail:String(err)});}
}
