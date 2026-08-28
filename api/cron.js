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

// Límite de tiempo para la ejecución en Vercel Hobby (10s)
const FUNCTION_START_TIME = Date.now();
const FUNCTION_TIMEOUT_MS = 9500; // 9.5 segundos para tener margen

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
    const profileByUserId = (profiles || []).reduce((acc, p) => {
      if (p.user_id) acc[p.user_id] = p;
      return acc;
    }, {});

    // 4. Obtener tareas de hoy o atrasadas y filtrar en JS idéntico a la App
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

    const debugInfo = [];
    let successfulSends = 0;

    // 6. SOLUCIÓN AL TIMEOUT: Enviar las notificaciones secuencialmente (una por una)
    // No usamos Promise.all() ni Promise.allSettled() en bucles serverless que duran más de 10s
    for (let i = 0; i < subscriptions.length; i++) {
      const sub = subscriptions[i];

      // Verificación de temporizador: Si ya pasaron 9.5s, paramos el bucle para evitar el timeout de Vercel
      if (Date.now() - FUNCTION_START_TIME > FUNCTION_TIMEOUT_MS) {
        console.warn(`[API-CRON]: Se ha alcanzado el límite de tiempo de Vercel (10s) en el índice ${i}. ${successfulSends}/${subscriptions.length} enviados.`);
        debugInfo.push({ endpoint: sub.endpoint, status: 'error', reason: 'Function timed out before send' });
        break; // Rompemos el bucle secuencial y retornamos lo que se haya logrado enviar.
      }

      const userProfile = profileByUserId[sub.user_id];
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
          const userCompletedToday = todaysLogs.filter(l => l.completed_by === userProfile?.id);
          if (userCompletedToday.length > 0) {
            title = '¡Misión Cumplida! 🎉';
            body = 'Gracias por completar tus tareas del hogar hoy. ¡A descansar!';
          }
        }
      }

      // Si no hay mensaje, saltamos este dispositivo
      if (!body) {
        debugInfo.push({ endpoint: sub.endpoint, status: 'skipped', reason: 'No tasks' });
        continue;
      }

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

      // Enviar SECUENCIALMENTE y AWAITar cada uno
      try {
        await webPush.sendNotification(pushSubscription, payload);
        successfulSends++;
        debugInfo.push({ endpoint: sub.endpoint, status: 'fulfilled' });
      } catch (err) {
        // Limpieza de endpoints obsoletos (Código 410 Gone / 404 Not Found)
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
          debugInfo.push({ endpoint: sub.endpoint, status: 'unsubscribed', reason: 'Endpoint obsoleted' });
        } else {
          console.error(`[API-CRON]: Error enviando a ${sub.endpoint}`, err);
          debugInfo.push({ endpoint: sub.endpoint, status: 'error', reason: err.message });
        }
        // No arrojamos el error, simplemente lo registramos y pasamos al siguiente endpoint
      }
    }

    const durationMs = Date.now() - FUNCTION_START_TIME;

    return res.status(200).json({ 
      success: true, 
      message: `Notificaciones personalizadas enviadas secuencialmente a ${successfulSends} de ${subscriptions.length} dispositivo(s).`,
      debug: {
        todayStr,
        typeDetected: type,
        totalSubscriptions: subscriptions.length,
        durationMs,
        timings: debugInfo
      }
    });
  } catch (error) {
    console.error(`[API-CRON-FATAL]:`, error);
    return res.status(500).json({ success: false, error: error.message });
  }
}