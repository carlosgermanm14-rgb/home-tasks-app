import { createClient } from '@supabase/supabase-js';
import webPush from 'web-push';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
// IMPORTANTE: Asegúrate de tener esta clave Service Role en las variables de Vercel
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = 'carlosgermanm14@gmail.com'; // Tu correo de admin

const supabase = createClient(supabaseUrl, supabaseServiceKey);

webPush.setVapidDetails(
  'mailto:carlosgermanm14@gmail.com',
  process.env.VITE_PUBLIC_VAPID_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  // 1. SEGURIDAD: Solo aceptar métodos POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  // 2. SEGURIDAD: Verificar autenticación del administrador
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  const token = authHeader.split(' ')[1];
  
  // Verificar el token JWT con Supabase Auth
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user || user.email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'No autorizado. Se requieren permisos de administrador.' });
  }

  try {
    // 3. LÓGICA DINÁMICA DE TIEMPO (Culiacán)
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

    // 4. LÓGICA DINÁMICA DE DATOS
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

    // 5. ENVÍO SECUENCIAL OPTIMIZADO CON MENSAJES DINÁMICOS
    let successfulSends = 0;
    
    for (const sub of subscriptions) {
      const userProfile = profileByUserId[sub.user_id];
      if (!userProfile) continue; // Saltamos si el dispositivo no está vinculado a un perfil

      const userTasks = todaysTasks.filter((t) => t.assigned_to === userProfile.id);
      const count = userTasks.length;
      const userName = userProfile.name;

      let title = `${greeting} ${userName}! 👋`;
      let body = '';

      if (count > 0) {
        // MENSAJE DINÁMICO 1: Tareas pendientes
        const taskListStr = userTasks.map((t) => t.title).join(', ');
        body = `Te quedan estas tareas: ${taskListStr}.`;
      } else {
        // MENSAJE DINÁMICO 2: Todo completado
        body = 'Felicidades ya terminaste, te amo. 🎉';
      }

      // Validar que tengamos contenido
      if (!body) continue;

      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };

      const payload = JSON.stringify({
        title,
        body,
        url: '/', // Abrir la app al hacer clic
      });

      try {
        await webPush.sendNotification(pushSubscription, payload);
        successfulSends++;
      } catch (err) {
        console.error(`[API-TRIGGER]: Error enviando a ${userName}`, err.statusCode);
        // Si la suscripción expiró (410) o no se encontró (404), la eliminamos
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        }
      }
    }

    return res.status(200).json({ 
      success: true, 
      message: `Disparo manual exitoso. Notificaciones personalizadas enviadas secuencialmente a ${successfulSends} de ${subscriptions.length} dispositivo(s).`
    });

  } catch (error) {
    console.error(`[API-TRIGGER-FATAL]:`, error);
    return res.status(500).json({ success: false, error: error.message });
  }
}