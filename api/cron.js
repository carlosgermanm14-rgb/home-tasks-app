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
    const type = req.query.type || 'morning';

    // 1. Obtener la fecha exacta de Culiacán (Sinaloa)
    const dateInSinaloa = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Mazatlan"}));
    const yyyy = dateInSinaloa.getFullYear();
    const mm = String(dateInSinaloa.getMonth() + 1).padStart(2, '0');
    const dd = String(dateInSinaloa.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    // 2. Obtener suscripciones push
    const { data: subscriptions, error: subError } = await supabase.from('push_subscriptions').select('*');
    if (subError) throw subError;
    if (!subscriptions || subscriptions.length === 0) {
      return res.status(200).json({ message: 'No hay dispositivos suscritos.' });
    }

    // 3. Obtener todas las tareas pendientes o atrasadas
    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select('*')
      .lte('next_due_date', todayStr);
    if (tasksError) throw tasksError;

    // 4. Si es la tarde (4pm), buscar en el historial si terminaron algo hoy
    let todaysLogs = [];
    if (type === 'afternoon') {
      const startOfDayISO = new Date(`${todayStr}T00:00:00-07:00`).toISOString();
      const { data: logs } = await supabase
        .from('task_logs')
        .select('*')
        .gte('created_at', startOfDayISO);
      todaysLogs = logs || [];
    }

    // 5. Enviar notificaciones
    const notifications = subscriptions.map((sub) => {
      const userTasks = tasks.filter((t) => t.assigned_to === sub.user_id);
      const count = userTasks.length;

      let title = '';
      let body = '';

      if (type === 'morning') {
        if (count > 0) {
          const taskList = userTasks.map((t) => t.title).join(', ');
          title = '¡Buenos días! ☀️';
          body = `No se te olviden tus tareas para hoy: ${taskList}.`;
        }
      } 
      else if (type === 'afternoon') {
        if (count > 0) {
          const taskList = userTasks.map((t) => t.title).join(', ');
          title = '¡Recordatorio de la tarde! ⏰';
          body = `Aún tienes pendientes por terminar: ${taskList}.`;
        } else {
          // Si no tiene pendientes, verificamos si hizo algo hoy para felicitarlo
          const userCompletedToday = todaysLogs.filter(l => l.completed_by === sub.user_id);
          if (userCompletedToday.length > 0) {
            title = '¡Misión Cumplida! 🎉';
            body = 'Gracias por hacer todas tus tareas del hogar hoy. ¡A disfrutar la tarde!';
          }
        }
      }

      // Si no hay mensaje, saltamos a este usuario
      if (!body) return Promise.resolve();

      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      const payload = JSON.stringify({
        title: title,
        body: body,
        url: '/',
      });

      return webPush.sendNotification(pushSubscription, payload).catch((err) => {
        if (err.statusCode === 410 || err.statusCode === 404) {
          supabase.from('push_subscriptions').delete().eq('id', sub.id);
        }
      });
    });

    await Promise.all(notifications);

    return res.status(200).json({ success: true, message: `Cron ${type} ejecutado correctamente.` });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
}