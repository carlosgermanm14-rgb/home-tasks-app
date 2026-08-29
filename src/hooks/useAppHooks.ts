import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { urlBase64ToUint8Array } from '../utils/helpers';
import type { Session } from '@supabase/supabase-js';
import type { Profile, Task } from '../types/database';

const PUBLIC_VAPID_KEY = import.meta.env.VITE_PUBLIC_VAPID_KEY;

export const useAuth = () => {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    return () => subscription.unsubscribe();
  }, []);

  return { session };
};

export const useTasks = (session: Session | null) => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  
  // SOLUCIÓN: Usamos un contador numérico como "gatillo" para refrescar los datos
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    // Variable de seguridad para evitar actualizar estado si el componente se desmontó
    let isMounted = true;

    const loadData = async () => {
      if (!session) {
        if (isMounted) setLoading(false);
        return;
      }

      try {
        const { data: profilesData } = await supabase.from('profiles').select('*');
        const { data: tasksData } = await supabase.from('tasks').select('*').order('next_due_date', { ascending: true });

        if (isMounted) {
          if (profilesData) setProfiles(profilesData);
          if (tasksData) setTasks(tasksData);
        }
      } catch (error) {
        console.error("Error al cargar tareas:", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [session, refreshTrigger]); // El effect reacciona cuando cambia la sesión o el trigger

  // Esta función ahora solo incrementa el número, obligando al useEffect a ejecutarse de nuevo
  const refreshData = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  return { profiles, tasks, loading, refreshData };
};

export const usePushNotifications = (session: Session | null, showToast: (msg: string, type: 'success' | 'error' | 'info') => void) => {
  const [pushEnabled, setPushEnabled] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg) reg.pushManager.getSubscription().then((sub) => { if (sub) setPushEnabled(true); });
      });
    }
  }, []);

  const subscribeToPush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      showToast('Navegador no soportado', 'error');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { showToast('Permiso denegado', 'error'); return; }
      const registration = await navigator.serviceWorker.register('/sw.js');
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        const convertedKey = urlBase64ToUint8Array(PUBLIC_VAPID_KEY);
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: convertedKey });
      }
      const subscriptionJSON = subscription.toJSON();
      if (session?.user?.id && subscriptionJSON.endpoint && subscriptionJSON.keys) {
        const { error } = await supabase.from('push_subscriptions').upsert({
          user_id: session.user.id,
          endpoint: subscriptionJSON.endpoint,
          p256dh: subscriptionJSON.keys.p256dh,
          auth: subscriptionJSON.keys.auth,
        }, { onConflict: 'endpoint' });
        if (!error) { setPushEnabled(true); showToast('Notificaciones activadas', 'success'); }
        else showToast('Error al guardar suscripción', 'error');
      }
    } catch (err) { console.error(err); showToast('Error al activar', 'error'); }
  };

  const unsubscribeFromPush = async (silent = false) => {
    if (!('serviceWorker' in navigator)) return;
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        const subscriptionJSON = subscription.toJSON();
        if (session?.user?.id && subscriptionJSON.endpoint) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', subscriptionJSON.endpoint).eq('user_id', session.user.id);
        }
      }
      setPushEnabled(false);
      if (!silent) showToast('Notificaciones desactivadas', 'success');
    } catch (error) { console.error(error); if (!silent) showToast('Error al desactivar', 'error'); }
  };

  return { pushEnabled, subscribeToPush, unsubscribeFromPush };
};