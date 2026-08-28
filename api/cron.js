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

    // 1. Fecha exacta de Culiacán (YYYY-MM-DD)
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

    // 3. Obtener nombres de los responsables
    const { data: profiles } = await supabase.from('profiles').select('*');
    const profilesMap = (profiles || []).reduce((acc, p) => {
      acc[p.id] = p.name;
      return acc;
    }, {});

    // 4. Obtener todas las tareas de la base de datos
    const { data: allTasks, error: tasksError } = await supabase.from('tasks').select('*');
    if (tasksError) throw tasksError;

    // 5. Normalizar la fecha recortando a 10 caracteres (YYYY-MM-DD)
    const tasks = (allTasks || []).filter((t) => {
      if (!t.next_due_date) return false;
      const cleanTaskDate = String(t.next_due_date).substring(0, 10);
      return cleanTaskDate <= todayStr;
    });

    // 6. Historial de tareas completadas para el turno de la tarde
    let todaysLogs = [];
    if (type === 'afternoon') {
      const startOfDayISO = new Date(`${todayStr}T00:00:00-07:00`).toISOString();
      const { data: logs } = await supabase
        .from('task_logs')
        .select('*')
        .gte('created_at', startOfDayISO);
      todaysLogs = logs || [];
    }

    const count = tasks.length;
    let title = '';
    let body = '';

    const taskSummary = tasks.map((t) => {
      const respName = profilesMap[t.assigned_to] || 'Sin asignar';
      return `${t.title} (${respName})`;
    }).join(', ');

    if (type === 'morning') {
      if (count > 0) {
        title = '¡Buenos días! ☀️';
        body = `Tareas para hoy en casa: ${taskSummary}.`;
      }
    } 
    else if (type === 'afternoon') {
      if (count > 0) {
        title = '¡Recordatorio de la tarde! ⏰';
        body = `Aún quedan ${count} tarea(s) pendientes: ${taskSummary}.`;
      } else if (todaysLogs.length > 0) {
        title = '¡Misión Cumplida! 🎉';
        body = 'Se han completado las tareas del hogar hoy. ¡A disfrutar la tarde!';
      }
    }

    if (!body) {
      return res.status(200).json({ 
        success: true, 
        message: 'No hay tareas pendientes para notificar.',
        debug: {
          todayStr,
          totalTasksInDB: (allTasks || []).length,
          allTasksInDB: (allTasks || []).map(t => ({
            title: t.title,
            rawDate: t.next_due_date,
            cleanDate: String(t.next_due_date).substring(0, 10)
          }))
        }
      });
    }

    // 7. Enviar notificación a todos los dispositivos
    const notifications = subscriptions.map((sub) => {
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

    return res.status(200).json({ success: true, message: `Cron ${type} ejecutado a todos los dispositivos.` });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
}