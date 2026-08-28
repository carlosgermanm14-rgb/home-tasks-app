import { createClient } from '@supabase/supabase-js';
import webPush from 'web-push';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

webPush.setVapidDetails(
  'mailto:carlosgermanm14@gmail.com',
  process.env.VITE_PUBLIC_VAPID_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  try {
    // Obtener la fecha actual en formato YYYY-MM-DD
    const todayStr = new Date().toISOString().split('T')[0];

    // 1. Obtener tareas pendientes para hoy o atrasadas
    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select('*')
      .lte('next_due_date', todayStr);

    if (tasksError) throw tasksError;

    // Si no hay tareas pendientes hoy, finalizamos en silencio
    if (!tasks || tasks.length === 0) {
      return res.status(200).json({ message: 'No hay tareas pendientes para hoy.' });
    }

    // 2. Obtener todas las suscripciones push de la base de datos
    const { data: subscriptions, error: subError } = await supabase
      .from('push_subscriptions')
      .select('*');

    if (subError) throw subError;

    if (!subscriptions || subscriptions.length === 0) {
      return res.status(200).json({ message: 'No hay dispositivos suscritos.' });
    }

    // 3. Notificar a cada dispositivo suscrito con sus tareas específicas
    const notifications = subscriptions.map((sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      // Filtrar tareas correspondientes al usuario
      const userTasks = tasks.filter((t) => t.assigned_to === sub.user_id);
      const count = userTasks.length;

      let body = 'Tienes actividades pendientes en casa.';
      if (count > 0) {
        const taskList = userTasks.map((t) => t.title).join(', ');
        body = `Tienes ${count} pendiente${count > 1 ? 's' : ''}: ${taskList}`;
      }

      const payload = JSON.stringify({
        title: 'Tareas del Hogar 🏠',
        body: body,
        url: '/',
      });

      return webPush.sendNotification(pushSubscription, payload).catch((err) => {
        // Limpiar suscripciones obsoletas o caducadas
        if (err.statusCode === 410 || err.statusCode === 404) {
          supabase.from('push_subscriptions').delete().eq('id', sub.id);
        }
      });
    });

    await Promise.all(notifications);

    return res.status(200).json({ success: true, message: 'Notificaciones enviadas correctamente.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
}