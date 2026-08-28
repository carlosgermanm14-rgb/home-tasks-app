import { createClient } from '@supabase/supabase-js';
import webPush from 'web-push';

// 1. CONEXIÓN CORREGIDA: Usamos el fallback a la ANON_KEY que ya existe en tu Vercel
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY; 
const ADMIN_EMAIL = 'carlosgermanm14@gmail.com';

const supabase = createClient(supabaseUrl, supabaseKey);

webPush.setVapidDetails(
  'mailto:carlosgermanm14@gmail.com',
  process.env.VITE_PUBLIC_VAPID_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No se detectó la sesión activa.' });
  }

  const token = authHeader.split(' ')[1];
  
  // 2. VALIDACIÓN DE USUARIO CORREGIDA Y MÁS DETALLADA
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError) {
    return res.status(401).json({ error: `Sesión inválida: ${authError.message}` });
  }

  // Comparamos los correos ignorando mayúsculas/minúsculas por seguridad
  if (!user || user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: `El usuario ${user?.email} no es administrador.` });
  }

  try {
    // LÓGICA DINÁMICA DE TIEMPO (Culiacán)
    const sinaloaTimeZone = "America/Mazatlan";
    const sinaloaDate = new Date(new Date().toLocaleString("en-US", { timeZone: sinaloaTimeZone }));
    
    const hour = sinaloaDate.getHours();
    const yyyy = sinaloaDate.getFullYear();
    const mm = String(sinaloaDate.getMonth() + 1).padStart(2, '0');
    const dd = String(sinaloaDate.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    // Determinar saludo dinámico por hora
    let greeting = '¡Hola';
    if (hour < 12) greeting = '¡Buenos días';
    else if (hour < 19) greeting = '¡Buenas tardes';
    else greeting = '¡Buenas noches';

    // Obtener dispositivos suscritos
    const { data: subscriptions } = await supabase.from('push_subscriptions').select('*');
    
    if (!subscriptions || subscriptions.length === 0) {
      return res.status(200).json({ success: true, message: 'No hay dispositivos suscritos.' });
    }

    // Obtener perfiles vinculados con user_id
    const { data: profiles } = await supabase.from('profiles').select('*');
    const profileByUserId = (profiles || []).reduce((acc, p) => {
      if (p.user_id) acc[p.user_id] = p;
      return acc;
    }, {});

    // Obtener tareas de hoy o atrasadas
    const { data: allTasks } = await supabase.from('tasks').select('*');
    const todaysTasks = (allTasks || []).filter((t) => {
      if (!t.next_due_date) return false;
      const cleanTaskDate = String(t.next_due_date).substring(0, 10);
      return cleanTaskDate <= todayStr;
    });

    // ENVÍO SECUENCIAL OPTIMIZADO CON MENSAJES DINÁMICOS
    let successfulSends = 0;
    
    for (const sub of subscriptions) {
      const userProfile = profileByUserId[sub.user_id];
      if (!userProfile) continue;

      const userTasks = todaysTasks.filter((t) => t.assigned_to === userProfile.id);
      const count = userTasks.length;
      const userName = userProfile.name;

      let title = `${greeting} ${userName}! 👋`;
      let body = '';

      if (count > 0) {
        const taskListStr = userTasks.map((t) => t.title).join(', ');
        body = `Te quedan estas tareas: ${taskListStr}.`;
      } else {
        body = 'Felicidades ya terminaste, te amo. 🎉';
      }

      if (!body) continue;

      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };

      const payload = JSON.stringify({ title, body, url: '/' });

      try {
        await webPush.sendNotification(pushSubscription, payload);
        successfulSends++;
      } catch (err) {
        console.error(`[API-TRIGGER]: Error enviando a ${userName}`, err.statusCode);
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        }
      }
    }

    return res.status(200).json({ 
      success: true, 
      message: `¡Listo! Se enviaron las notificaciones a ${successfulSends} teléfono(s).`
    });

  } catch (error) {
    console.error(`[API-TRIGGER-FATAL]:`, error);
    return res.status(500).json({ success: false, error: error.message });
  }
}