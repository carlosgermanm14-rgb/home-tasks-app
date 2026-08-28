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
    const rawType = String(req.query.type || 'morning').trim().toLowerCase();
    const type = rawType.includes('afternoon') ? 'afternoon' : 'morning';

    // 1. Fecha exacta de Culiacán (YYYY-MM-DD)
    const dateInSinaloa = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Mazatlan" }));
    const yyyy = dateInSinaloa.getFullYear();
    const mm = String(dateInSinaloa.getMonth() + 1).padStart(2, '0');
    const dd = String(dateInSinaloa.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    // 2. Obtener dispositivos suscritos
    const { data: subscriptions, error: subError } = await supabase.from('push_subscriptions').select('*');
    if (subError) throw subError;
    if (!subscriptions || subscriptions.length === 0) {
      return res.status(200).json({ success: false, message: 'No hay dispositivos suscritos.' });
    }

    // 3. Obtener perfiles vinculados con user_id
    const { data: profiles } = await supabase.from('profiles').select('*');
    
    // Crear mapas para buscar rápido por user_id y por profile.id
    const profileByUserId = (profiles || []).reduce((acc, p) => {
      if (p.user_id) acc[p.user_id] = p;
      return acc;
    }, {});

    // 4. Obtener tareas de hoy o atrasadas
    const { data: allTasks, error: tasksError } = await supabase.from('tasks').select('*');
    if (tasksError) throw tasksError;

    const todaysTasks = (allTasks || []).filter((t) => {
      if (!t.next_due_date) return false;
      const cleanTaskDate = String(t.next_due_date).substring(0, 10);
      return cleanTaskDate <= todayStr;
    });

    // 5. Historial si es el turno de la tarde
    let todaysLogs = [];
    if (type === 'afternoon') {
      const startOfDayISO = new Date(`${todayStr}T00:00:00-07:00`).toISOString();
      const { data: logs } = await supabase
        .from('task_logs')
        .select('*')
        .gte('created_at', startOfDayISO);
      todaysLogs = logs || [];
    }

    // 6. Enviar notificación personalizada A CADA USUARIO
    const sendResults = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        // Encontrar qué perfil le pertenece a este teléfono
        const userProfile = profileByUserId[sub.user_id];
        
        // Filtrar solo las tareas asignadas a este perfil
        const userTasks = userProfile 
          ? todaysTasks.filter((t) => t.assigned_to === userProfile.id)
          : [];

        const count = userTasks.length;
        let title = '';
        let body = '';

        const taskListStr = userTasks.map((t) => t.title).join(', ');
        const userName = userProfile ? userProfile.name : '';

        if (type === 'morning') {
          if (count > 0) {
            title = `¡Buenos días${userName ? ' ' + userName : ''}! ☀️`;
            body = `Tus tareas para hoy: ${taskListStr}.`;
          }
        } else {
          if (count > 0) {
            title = `¡Recordatorio${userName ? ' ' + userName : ''}! ⏰`;
            body = `Aún tienes ${count} pendiente(s): ${taskListStr}.`;
          } else {
            // Verificar si este usuario en específico hizo tareas hoy
            const userCompletedToday = todaysLogs.filter(l => l.completed_by === userProfile?.id);
            if (userCompletedToday.length > 0) {
              title = '¡Misión Cumplida! 🎉';
              body = 'Gracias por completar tus tareas del hogar hoy. ¡A descansar!';
            }
          }
        }

        // Si este usuario no tiene tareas ni mensaje, no le enviamos nada
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
          throw err;
        });
      })
    );

    const successfulSends = sendResults.filter(r => r.status === 'fulfilled').length;

    return res.status(200).json({ 
      success: true, 
      message: `Notificaciones personalizadas enviadas a ${successfulSends} dispositivo(s).`
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
}