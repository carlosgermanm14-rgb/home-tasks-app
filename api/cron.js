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
    // Detectar qué horario se está ejecutando (morning, afternoon, evening)
    const type = req.query.type || 'morning';

    // 1. Obtener la fecha exacta de Culiacán (Sinaloa) sin importar dónde esté el servidor
    const dateInSinaloa = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Mazatlan"}));
    const yyyy = dateInSinaloa.getFullYear();
    const mm = String(dateInSinaloa.getMonth() + 1).padStart(2, '0');
    const dd = String(dateInSinaloa.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    // 2. Obtener todas las suscripciones push
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

    // 4. Si es la noche (6pm), obtener el historial para saber si terminaron algo hoy
    let todaysLogs = [];
    if (type === 'evening') {
      const startOfDayISO = new Date(`${todayStr}T00:00:00-07:00`).toISOString();
      const { data: logs } = await supabase
        .from('task_logs')
        .select('*')
        .gte('created_at', startOfDayISO); // Traer todo lo que se completó hoy
      todaysLogs = logs || [];
    }

    // 5. Configurar y enviar las notificaciones personalizadas
    const notifications = subscriptions.map((sub) => {
      // Filtrar tareas que le tocan a esta persona en específico
      const userTasks = tasks.filter((t) => t.assigned_to === sub.user_id);
      const count = userTasks.length;

      let title = 'Tareas del Hogar 🏠';
      let body = '';

      // --- LÓGICA DE MENSAJES AMIGABLES ---
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
          title = '¡Recordatorio! ⏰';
          body = `Aún tienes ${count} pendiente(s) por terminar: ${taskList}.`;
        }
      } 
      else if (type === 'evening') {
        if (count > 0) {
          const taskList = userTasks.map((t) => t.title).join(', ');
          title = '¡Se acaba el día! 🌙';
          body = `Último aviso, te faltan estas tareas: ${taskList}.`;
        } else {
          // No tiene pendientes. ¿Terminó tareas el día de hoy?
          const userCompletedToday = todaysLogs.filter(l => l.completed_by === sub.user_id);
          if (userCompletedToday.length > 0) {
            title = '¡Misión Cumplida! 🎉';
            body = 'Gracias por hacer todas tus tareas del hogar hoy. ¡A descansar! Te amo';
          }
        }
      }

      // Si no se asignó un 'body', significa que no hay nada que notificarle a este usuario, lo saltamos.
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
        // Limpiar suscripciones eliminadas de Chrome/Safari
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