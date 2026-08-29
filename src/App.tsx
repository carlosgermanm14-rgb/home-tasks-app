import { useEffect, useState, useMemo } from 'react';
import { supabase } from './supabaseClient';
import { Plus, X, LogOut, Bell, BellOff, CheckCircle2, AlertCircle, Trash2, User, Lock, Check, RotateCcw, Pencil, Moon, Sun, Zap } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import type { Profile, Task } from './types/database';

const PUBLIC_VAPID_KEY = import.meta.env.VITE_PUBLIC_VAPID_KEY;
const ADMIN_EMAIL = 'carlosgermanm14@gmail.com';

const getTodayFormatted = () => {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const getDaysRemaining = (targetDateStr: string) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [yyyy, mm, dd] = targetDateStr.split('-').map(Number);
  const targetDate = new Date(yyyy, mm - 1, dd);
  targetDate.setHours(0, 0, 0, 0);

  const diffTime = targetDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return 'Hoy';
  if (diffDays === 1) return 'Mañana';
  return `Faltan ${diffDays} días`;
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

type ToastData = {
  message: string;
  type: 'success' | 'error' | 'info';
  action?: {
    label: string;
    onClick: () => void;
  };
} | null;

const ToastNotification = ({ toast }: { toast: ToastData }) => {
  if (!toast) return null;

  const bgColor = toast.type === 'success' ? 'bg-emerald-950' : toast.type === 'error' ? 'bg-rose-950' : 'bg-indigo-950';
  const textColor = toast.type === 'success' ? 'text-emerald-300' : toast.type === 'error' ? 'text-rose-300' : 'text-indigo-300';
  const borderColor = toast.type === 'success' ? 'border-emerald-500/30' : toast.type === 'error' ? 'border-rose-500/30' : 'border-indigo-500/30';

  return (
    <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-4 py-2.5 rounded-full shadow-2xl text-sm font-medium animate-in slide-in-from-top-4 fade-in duration-300 backdrop-blur-md ${bgColor} ${textColor} ${borderColor} border`}>
      <div className="flex items-center gap-2">
        {toast.type === 'success' && <CheckCircle2 className="w-4 h-4" />}
        {toast.type === 'error' && <AlertCircle className="w-4 h-4" />}
        {toast.type === 'info' && <Zap className="w-4 h-4" />}
        <span className="text-slate-200">{toast.message}</span>
      </div>
      {toast.action && (
        <button
          onClick={toast.action.onClick}
          className="ml-1 px-2.5 py-0.5 rounded-full bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 text-xs font-bold border border-indigo-500/40 transition-colors uppercase tracking-wider"
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
};

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskToDeleteId, setTaskToDeleteId] = useState<string | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [triggerLoading, setTriggerLoading] = useState(false);

  const todayStr = getTodayFormatted();

  const [title, setTitle] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [intervalDays, setIntervalDays] = useState(7);
  const [startDate, setStartDate] = useState(todayStr);

  const [toast, setToast] = useState<ToastData>(null);

  const isAdmin = session?.user?.email === ADMIN_EMAIL;

  const dateOptions = useMemo(() => {
    const options = [];
    const baseDate = new Date();

    for (let i = 0; i <= 7; i++) {
      const date = new Date(baseDate);
      date.setDate(baseDate.getDate() + i);

      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      const value = `${yyyy}-${mm}-${dd}`;

      let label;
      if (i === 0) {
        label = 'Hoy';
      } else if (i === 1) {
        label = 'Mañana';
      } else {
        const weekday = date.toLocaleDateString('es-MX', { weekday: 'long' });
        label = `${weekday.charAt(0).toUpperCase() + weekday.slice(1)} ${date.getDate()}`;
      }

      options.push({ value, label });
    }

    if (startDate && !options.some(o => o.value === startDate)) {
      options.unshift({ value: startDate, label: `Fecha actual (${startDate})` });
    }

    return options;
  }, [startDate]);

  const showToast = (
    message: string,
    type: 'success' | 'error' | 'info' = 'success',
    action?: { label: string; onClick: () => void }
  ) => {
    setToast({ message, type, action });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), toast.action ? 5000 : 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function fetchInitialData() {
      if (!session) return;

      const { data: profilesData } = await supabase.from('profiles').select('*');
      const { data: tasksData } = await supabase.from('tasks').select('*').order('next_due_date', { ascending: true });

      if (isMounted) {
        if (profilesData) setProfiles(profilesData);
        if (tasksData) setTasks(tasksData);
        setLoading(false);
      }
    }

    fetchInitialData();

    return () => {
      isMounted = false;
    };
  }, [session]);

  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg) {
          reg.pushManager.getSubscription().then((sub) => {
            if (sub) setPushEnabled(true);
          });
        }
      });
    }
  }, []);

  const refreshData = async () => {
    const { data: profilesData } = await supabase.from('profiles').select('*');
    if (profilesData) setProfiles(profilesData);

    const { data: tasksData } = await supabase.from('tasks').select('*').order('next_due_date', { ascending: true });
    if (tasksData) setTasks(tasksData);
  };

  const subscribeToPush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      showToast('Tu navegador no soporta notificaciones push', 'error');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        showToast('Permiso de notificaciones denegado', 'error');
        return;
      }

      const registration = await navigator.serviceWorker.register('/sw.js');
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        const convertedKey = urlBase64ToUint8Array(PUBLIC_VAPID_KEY);
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedKey,
        });
      }

      const subscriptionJSON = subscription.toJSON();

      if (session?.user?.id && subscriptionJSON.endpoint && subscriptionJSON.keys) {
        const { error } = await supabase.from('push_subscriptions').upsert({
          user_id: session.user.id,
          endpoint: subscriptionJSON.endpoint,
          p256dh: subscriptionJSON.keys.p256dh,
          auth: subscriptionJSON.keys.auth,
        }, { onConflict: 'endpoint' });

        if (!error) {
          setPushEnabled(true);
          showToast('Notificaciones activadas', 'success');
        } else {
          showToast('Error al guardar suscripción', 'error');
        }
      }
    } catch (err) {
      console.error(err);
      showToast('Error al activar notificaciones', 'error');
    }
  };

  const unsubscribeFromPush = async () => {
    if (!('serviceWorker' in navigator)) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();

        const subscriptionJSON = subscription.toJSON();
        if (session?.user?.id && subscriptionJSON.endpoint) {
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('endpoint', subscriptionJSON.endpoint)
            .eq('user_id', session.user.id);
        }
      }

      setPushEnabled(false);
      if (session) showToast('Notificaciones desactivadas', 'success');
    } catch (error) {
      console.error(error);
      if (session) showToast('Error al desactivar notificaciones', 'error');
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) showToast('Correo o contraseña incorrectos', 'error');
    setAuthLoading(false);
  };

  const handleSignOut = async () => {
    if (pushEnabled) {
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();

        if (subscription) {
          await subscription.unsubscribe();

          const subscriptionJSON = subscription.toJSON();
          if (session?.user?.id && subscriptionJSON.endpoint) {
            await supabase
              .from('push_subscriptions')
              .delete()
              .eq('endpoint', subscriptionJSON.endpoint)
              .eq('user_id', session.user.id);
          }
        }
      } catch (err) {
        console.error("Error cleaning up push subscriptions during sign out", err);
      }
    }

    setPushEnabled(false);
    setSession(null);
    await supabase.auth.signOut();
  };

  const handleManualTrigger = async () => {
    if (!isAdmin || !session) return;
    setTriggerLoading(true);
    showToast('Iniciando envío manual secuencial...', 'info');

    try {
      const response = await fetch('/api/trigger-notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showToast(data.message, 'success');
      } else {
        showToast(data.error || 'Error al disparar notificaciones', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error de red al conectar con la API', 'error');
    } finally {
      setTriggerLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    if (!isAdmin) {
      showToast('Solo el administrador puede crear tareas', 'error');
      return;
    }
    setEditingTask(null);
    setTitle('');
    setAssignedTo('');
    setIntervalDays(7);
    setStartDate(todayStr);
    setShowForm(true);
  };

  const handleOpenEditModal = (task: Task) => {
    if (!isAdmin) {
      showToast('Solo el administrador puede editar tareas', 'error');
      return;
    }
    setEditingTask(task);
    setTitle(task.title);
    setAssignedTo(task.assigned_to || '');
    setIntervalDays(task.interval_days);
    setStartDate(task.next_due_date);
    setShowForm(true);
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    if (!title.trim() || !assignedTo || !startDate) {
      showToast('Completa todos los campos obligatorios', 'error');
      return;
    }

    if (editingTask) {
      const { error } = await supabase.from('tasks').update({
        title: title.trim(),
        assigned_to: assignedTo,
        interval_days: intervalDays,
        next_due_date: startDate,
      }).eq('id', editingTask.id);

      if (!error) {
        setShowForm(false);
        await refreshData();
        showToast('Tarea actualizada', 'success');
      }
    } else {
      const newTask = {
        title: title.trim(),
        assigned_to: assignedTo,
        interval_days: intervalDays,
        next_due_date: startDate,
        is_completed: false,
      };

      const { error } = await supabase.from('tasks').insert([newTask]);

      if (!error) {
        setShowForm(false);
        await refreshData();
        showToast('Tarea guardada', 'success');
      }
    }
  };

  const handleCompleteTask = async (task: Task) => {
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + task.interval_days);

    const yyyy = nextDate.getFullYear();
    const mm = String(nextDate.getMonth() + 1).padStart(2, '0');
    const dd = String(nextDate.getDate()).padStart(2, '0');
    const nextDueDateString = `${yyyy}-${mm}-${dd}`;

    await supabase.from('task_logs').insert([{
      task_id: task.id,
      completed_by: task.assigned_to,
    }]);

    const { error } = await supabase.from('tasks').update({
      next_due_date: nextDueDateString,
    }).eq('id', task.id);

    if (!error) {
      await refreshData();
      showToast(`"${task.title}" completada 🎉`, 'success', {
        label: 'Deshacer',
        onClick: () => handleUndoTask(task),
      });
    }
  };

  const handleUndoTask = async (task: Task) => {
    const { error } = await supabase.from('tasks').update({
      next_due_date: todayStr,
    }).eq('id', task.id);

    if (!error) {
      await refreshData();
      showToast(`Tarea reasignada a Hoy`, 'success');
    }
  };

  const confirmDeleteTask = async () => {
    if (!taskToDeleteId || !isAdmin) return;

    const { error } = await supabase.from('tasks').delete().eq('id', taskToDeleteId);

    setTaskToDeleteId(null);
    if (!error) {
      await refreshData();
      showToast('Tarea eliminada', 'success');
    }
  };

  const RenderBadge = ({ profileId }: { profileId?: string }) => {
    if (!profileId) {
      return (
        <span className="inline-flex items-center gap-1 bg-slate-800 text-slate-400 text-[10px] font-semibold px-2.5 py-0.5 rounded-full border border-slate-700">
          <User className="w-3 h-3" /> Sin asignar
        </span>
      );
    }

    const profile = profiles.find((p) => p.id === profileId);
    const name = profile ? profile.name : 'Desconocido';

    const isAida = name.toLowerCase().includes('aida');
    const isGeovanny = name.toLowerCase().includes('geovanny');

    let badgeStyle = 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30';
    if (isAida) badgeStyle = 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30';
    if (isGeovanny) badgeStyle = 'bg-sky-500/15 text-sky-300 border-sky-500/30';

    return (
      <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${badgeStyle}`}>
        <User className="w-3 h-3 opacity-70" /> {name}
      </span>
    );
  };

  if (!session) {
    return (
      <div 
        className="min-h-screen w-full flex flex-col justify-end items-center p-4 font-sans select-none bg-[#bce1fa] bg-top bg-cover bg-no-repeat relative"
        style={{ backgroundImage: "url('/fondo_login.webp')" }}
      >
        <ToastNotification toast={toast} />

        <div className="w-full max-w-sm bg-white rounded-[32px] p-6 shadow-2xl border border-sky-100/80 mb-4 sm:mb-8 relative z-10">

          <h2 className="text-center font-bold text-slate-800 text-sm mb-5">
            ¡Hola! Inicia sesión para continuar.
          </h2>

          <form onSubmit={handleAuth} className="space-y-3.5">
            <div className="relative">
              <User className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-sky-400" />
              <input
                type="email"
                required
                placeholder="Usuario o Correo"
                className="w-full bg-[#f0f7fd] border border-sky-100 rounded-2xl py-3.5 pl-11 pr-4 text-[16px] font-medium text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-300 transition-all"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="relative">
              <Lock className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-sky-400" />
              <input
                type="password"
                required
                placeholder="Contraseña"
                className="w-full bg-[#f0f7fd] border border-sky-100 rounded-2xl py-3.5 pl-11 pr-4 text-[16px] font-medium text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-300 transition-all"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs tracking-wider uppercase py-4 rounded-2xl shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 mt-1"
            >
              {authLoading ? 'CARGANDO...' : 'INICIAR SESIÓN'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // --- NUEVA LÓGICA DE ORDENAMIENTO Y MENSAJES PERSONALIZADOS ---
  const todaysTasks = tasks.filter(task => task.next_due_date <= todayStr);
  const upcomingTasks = tasks.filter(task => task.next_due_date > todayStr);

  const currentUserProfile = profiles.find(p => p.user_id === session?.user?.id);
  
  // Separar las tareas del usuario actual y las del resto de la casa
  const myTodaysTasks = todaysTasks.filter(task => task.assigned_to === currentUserProfile?.id);
  const othersTodaysTasks = todaysTasks.filter(task => task.assigned_to !== currentUserProfile?.id);
  
  const myUpcomingTasks = upcomingTasks.filter(task => task.assigned_to === currentUserProfile?.id);
  const othersUpcomingTasks = upcomingTasks.filter(task => task.assigned_to !== currentUserProfile?.id);

  return (
    <div className={`min-h-screen relative font-sans antialiased ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'}`}>

      <div 
        className="fixed inset-0 z-0 opacity-[0.04] pointer-events-none bg-slate-950 bg-repeat bg-center"
        style={{ backgroundImage: "url('/fondo_login.webp')", opacity: darkMode ? 0.04 : 0.02 }}
      ></div>

      <div className="relative z-10 p-4 max-w-md mx-auto pb-20">
        <ToastNotification toast={toast} />

        <header className="mb-6 pt-2 flex justify-between items-start gap-4">
          <div>
            <h1 className={`text-2xl font-extrabold tracking-tight ${darkMode ? 'text-white' : 'text-slate-950'}`}>Tareas del Hogar</h1>
            <p className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'} mt-0.5`}>Gestión de pendientes</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
             <button
              onClick={() => setDarkMode(!darkMode)}
              className={`p-2 rounded-full backdrop-blur-sm transition-colors ${darkMode ? 'bg-slate-800/80 text-amber-400 hover:bg-slate-700/80' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
              title={darkMode ? "Activar modo claro" : "Activar modo oscuro"}
            >
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button
              onClick={pushEnabled ? unsubscribeFromPush : subscribeToPush}
              className={`p-2 rounded-full transition-colors ${
                pushEnabled
                  ? (darkMode ? 'text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20' : 'text-emerald-600 bg-emerald-100 hover:bg-emerald-200')
                  : (darkMode ? 'text-slate-400 hover:text-indigo-400 hover:bg-slate-900' : 'text-slate-500 hover:text-indigo-600 hover:bg-slate-200')
              }`}
              title={pushEnabled ? 'Desactivar notificaciones' : 'Activar notificaciones'}
            >
              {pushEnabled ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
            </button>
            <button 
              onClick={handleSignOut}
              className={`p-2 rounded-full transition-colors ${darkMode ? 'text-slate-400 hover:text-rose-400 hover:bg-slate-900' : 'text-slate-500 hover:text-rose-600 hover:bg-slate-200'}`}
              title="Cerrar sesión"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

        {isAdmin && (
          <section className={`mb-6 p-4 rounded-2xl border ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
            <h2 className={`text-xs font-bold tracking-wider uppercase mb-3 pl-1 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Panel de Control (Admin)</h2>
            <button
              onClick={handleManualTrigger}
              disabled={triggerLoading}
              className={`w-full flex items-center justify-center gap-2 font-semibold text-white py-3.5 rounded-xl text-sm shadow-md transition-all active:scale-95 disabled:opacity-50 ${darkMode ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-indigo-700 hover:bg-indigo-600'}`}
            >
              <Zap className="w-4 h-4" />
              {triggerLoading ? 'Enviando secuencialmente...' : 'Disparar Notificaciones Dinámicas Now'}
            </button>
          </section>
        )}

        <section className="pb-16">
          {loading ? (
            <div className={`p-4 border rounded-2xl text-center ${darkMode ? 'bg-slate-900/80 border-slate-800/80' : 'bg-white border-slate-200'}`}>
              <p className={`text-xs animate-pulse ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>Cargando tareas...</p>
            </div>
          ) : tasks.length === 0 ? (
            <div className={`p-10 border rounded-2xl text-center flex flex-col items-center justify-center ${darkMode ? 'bg-slate-900/60 border-slate-800/60' : 'bg-white border-slate-200'}`}>
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
                <Plus className={`w-6 h-6 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} />
              </div>
              <p className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Nada por aquí</p>
              <p className={`text-xs mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                {isAdmin ? 'Presiona el botón + para agregar tareas' : 'Cuando se agreguen tareas las verás aquí'}
              </p>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <h2 className={`text-xs font-bold tracking-wider uppercase mb-3 pl-1 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Para hoy</h2>

                {todaysTasks.length === 0 ? (
                  <div className={`p-6 border border-dashed rounded-2xl text-center ${darkMode ? 'bg-slate-900/60 border-slate-800/60' : 'bg-white/80 border-slate-200'}`}>
                    <p className={`text-sm font-medium ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>¡Toda la casa está lista por hoy! 🎉</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* MENSAJE DE ÉXITO PERSONALIZADO */}
                    {currentUserProfile && myTodaysTasks.length === 0 && othersTodaysTasks.length > 0 && (
                      <div className={`p-4 rounded-2xl text-center border ${darkMode ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-emerald-50 border-emerald-200'}`}>
                        <p className={`text-sm font-semibold ${darkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>¡Terminaste tus tareas de hoy! 🎉</p>
                        <p className={`text-xs mt-1 ${darkMode ? 'text-emerald-400/70' : 'text-emerald-600/80'}`}>Aún quedan actividades del hogar pendientes.</p>
                      </div>
                    )}

                    {/* LISTA ORDENADA (Mis tareas primero, luego el resto) */}
                    <div className="space-y-3">
                      {[...myTodaysTasks, ...othersTodaysTasks].map((task) => (
                        <div key={task.id} className={`p-4 rounded-2xl shadow-sm space-y-3 transition-all backdrop-blur-sm border ${darkMode ? 'bg-slate-900/90 border-slate-700/80 shadow-slate-950/20' : 'bg-white border-slate-200 shadow-slate-100'}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1.5">
                              <h3 className={`font-semibold text-sm ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>{task.title}</h3>
                              <RenderBadge profileId={task.assigned_to} />
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {isAdmin && (
                                <>
                                  <button
                                    onClick={() => handleOpenEditModal(task)}
                                    className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'text-slate-500 hover:text-indigo-400 hover:bg-slate-800' : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-100'}`}
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => setTaskToDeleteId(task.id)}
                                    className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'text-slate-500 hover:text-rose-400 hover:bg-slate-800' : 'text-slate-400 hover:text-rose-600 hover:bg-slate-100'}`}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                              <button
                                onClick={() => handleCompleteTask(task)}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-3 py-1.5 rounded-xl text-xs flex items-center gap-1 shadow-md shadow-emerald-600/20 transition-all active:scale-95 shrink-0 ml-1"
                              >
                                <Check className="w-3.5 h-3.5" /> Completar
                              </button>
                            </div>
                          </div>

                          <div className={`flex items-center justify-between pt-2.5 border-t text-[11px] ${darkMode ? 'border-slate-800/60' : 'border-slate-100'}`}>
                            <span className={`${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                              Cada <span className={`${darkMode ? 'text-indigo-400/80 font-medium' : 'text-indigo-600 font-medium'}`}>{task.interval_days} días</span>
                            </span>
                            <span className={`${darkMode ? 'text-slate-300 font-medium' : 'text-slate-700 font-medium'}`}>
                              Hoy
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {upcomingTasks.length > 0 && (
                <div>
                  <h2 className={`text-xs font-bold tracking-wider uppercase mb-3 pl-1 ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>Próximas</h2>
                  <div className="space-y-3">
                    {/* Lista ordenada para próximas tareas (las mías primero) */}
                    {[...myUpcomingTasks, ...othersUpcomingTasks].map((task) => (
                      <div key={task.id} className={`p-4 rounded-2xl shadow-sm space-y-3 transition-all backdrop-blur-sm border opacity-80 hover:opacity-100 ${darkMode ? 'bg-slate-900/60 border-slate-800/60 shadow-slate-950/20' : 'bg-white border-slate-200/80 shadow-slate-100'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1.5">
                            <h3 className={`font-semibold text-sm ${darkMode ? 'text-slate-400' : 'text-slate-800'}`}>{task.title}</h3>
                            <RenderBadge profileId={task.assigned_to} />
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {isAdmin && (
                              <>
                                <button
                                  onClick={() => handleOpenEditModal(task)}
                                  className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'text-slate-500 hover:text-indigo-400 hover:bg-slate-800/60' : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-100/80'}`}
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setTaskToDeleteId(task.id)}
                                  className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'text-slate-600 hover:text-rose-400 hover:bg-slate-800/60' : 'text-slate-400 hover:text-rose-600 hover:bg-slate-100/80'}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => handleUndoTask(task)}
                              title="Mover a hoy manually"
                              className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'text-slate-500 hover:text-indigo-400 hover:bg-slate-800/60' : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-100/80'}`}
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <div className={`flex items-center justify-between pt-2.5 border-t text-[11px] ${darkMode ? 'border-slate-800/40' : 'border-slate-100'}`}>
                          <span className={`${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                            Cada <span className={`${darkMode ? 'text-indigo-400/60 font-medium' : 'text-indigo-600 font-medium'}`}>{task.interval_days} días</span>
                          </span>
                          <span className={`${darkMode ? 'text-slate-500 font-medium' : 'text-slate-600 font-medium'}`}>
                            {getDaysRemaining(task.next_due_date)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {isAdmin && (
          <button
            onClick={handleOpenCreateModal}
            className={`fixed bottom-6 right-1/2 translate-x-[180px] sm:translate-x-[160px] w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-90 z-40 ${darkMode ? 'bg-slate-100 text-slate-950 hover:bg-white shadow-lg shadow-slate-900/50' : 'bg-slate-950 text-white hover:bg-slate-900 shadow-xl shadow-slate-950/20'}`}
          >
            <Plus className="w-7 h-7" />
          </button>
        )}

        {taskToDeleteId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className={`p-6 rounded-3xl shadow-2xl w-full max-w-sm space-y-4 text-center relative z-50 border ${darkMode ? 'bg-slate-900 border-slate-700/50 backdrop-blur-md shadow-slate-950/30' : 'bg-white border-slate-100 shadow-slate-200'}`}>
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto border ${darkMode ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-rose-100 text-rose-600 border-rose-200'}`}>
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-slate-950'}`}>¿Eliminar esta tarea?</h3>
                <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Esta acción no se puede deshacer y borrará el historial de la actividad.</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setTaskToDeleteId(null)}
                  className={`w-1/2 font-medium py-3 rounded-xl text-xs transition-all ${darkMode ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteTask}
                  className="w-1/2 bg-rose-600 hover:bg-rose-500 text-white font-medium py-3 rounded-xl text-xs transition-all shadow-lg shadow-rose-600/25"
                >
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        )}

        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <form onSubmit={handleSaveTask} className={`p-6 rounded-3xl shadow-2xl w-full max-w-sm space-y-4 relative animate-in fade-in zoom-in-95 duration-200 z-50 border ${darkMode ? 'bg-slate-900 border-slate-700/50 backdrop-blur-md shadow-slate-950/30' : 'bg-white border-slate-100 shadow-slate-200'}`}>

              <button 
                type="button" 
                onClick={() => setShowForm(false)}
                className={`absolute top-4 right-4 p-1 rounded-full hover:bg-slate-800 transition-colors ${darkMode ? 'text-slate-400 hover:text-white' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
              >
                <X className="w-5 h-5" />
              </button>

              <div>
                <h2 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-slate-950'}`}>{editingTask ? 'Editar Tarea' : 'Nueva Tarea'}</h2>
                <p className={`text-xs mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  {editingTask ? 'Modifica los datos de la actividad' : 'Completa todos los campos obligatorios'}
                </p>
              </div>

              <div>
                <label className={`block text-xs font-medium mb-1.5 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Nombre de la tarea *</label>
                <input
                  type="text"
                  className={`w-full rounded-xl p-3 text-[16px] focus:outline-none focus:ring-2 transition-all ${darkMode ? 'bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-600 focus:ring-indigo-500/50' : 'bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:ring-indigo-300'}`}
                  placeholder="Ej: Lavar el carro"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className={`block text-xs font-medium mb-1.5 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Responsable *</label>
                <select
                  className={`w-full rounded-xl p-3 text-[16px] focus:outline-none focus:ring-2 transition-all appearance-none ${darkMode ? 'bg-slate-950 border border-slate-800 text-slate-100 focus:ring-indigo-500/50' : 'bg-slate-50 border border-slate-200 text-slate-900 focus:ring-indigo-300'}`}
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  required
                >
                  <option value="" disabled className={darkMode ? 'bg-slate-900' : 'bg-white'}>Selecciona un responsable</option>
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id} className={darkMode ? 'bg-slate-900' : 'bg-white'}>
                      {profile.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={`block text-xs font-medium mb-1.5 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>¿Cuándo inicia? *</label>
                <select
                  className={`w-full rounded-xl p-3 text-[16px] focus:outline-none focus:ring-2 transition-all appearance-none ${darkMode ? 'bg-slate-950 border border-slate-800 text-slate-100 focus:ring-indigo-500/50' : 'bg-slate-50 border border-slate-200 text-slate-900 focus:ring-indigo-300'}`}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                >
                  {dateOptions.map((opt) => (
                    <option key={opt.value} value={opt.value} className={darkMode ? 'bg-slate-900' : 'bg-white'}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={`block text-xs font-medium mb-1.5 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Frecuencia en días *</label>
                <input
                  type="number"
                  min="1"
                  className={`w-full rounded-xl p-3 text-[16px] focus:outline-none focus:ring-2 transition-all ${darkMode ? 'bg-slate-950 border border-slate-800 text-slate-100 focus:ring-indigo-500/50' : 'bg-slate-50 border border-slate-200 text-slate-900 focus:ring-indigo-300'}`}
                  value={intervalDays}
                  onChange={(e) => setIntervalDays(Number(e.target.value))}
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white font-medium py-3.5 rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/25 mt-2"
              >
                {editingTask ? 'Actualizar Tarea' : 'Guardar Tarea'}
              </button>
            </form>
          </div>
        )}

      </div>
    </div>
  );
}