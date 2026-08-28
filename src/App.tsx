import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { Plus, X, LogOut, Bell, BellOff, CheckCircle2, AlertCircle, Trash2, User, Check, RotateCcw } from 'lucide-react';
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
  if (diffDays === 1) return 'Falta 1 día';
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
  type: 'success' | 'error';
  action?: {
    label: string;
    onClick: () => void;
  };
} | null;

const ToastNotification = ({ toast }: { toast: ToastData }) => {
  if (!toast) return null;
  return (
    <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-4 py-2.5 rounded-full shadow-2xl text-sm font-medium animate-in slide-in-from-top-4 fade-in duration-300 backdrop-blur-md ${
      toast.type === 'success'
        ? 'bg-slate-900/95 text-emerald-400 border border-emerald-500/30'
        : 'bg-slate-900/95 text-rose-400 border border-rose-500/30'
    }`}>
      <div className="flex items-center gap-2">
        {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-rose-400" />}
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
  const [pushEnabled, setPushEnabled] = useState(false);

  const [title, setTitle] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [intervalDays, setIntervalDays] = useState(7);

  const [toast, setToast] = useState<ToastData>(null);

  const todayStr = getTodayFormatted();
  const isAdmin = session?.user?.email === ADMIN_EMAIL;

  const showToast = (
    message: string,
    type: 'success' | 'error' = 'success',
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
      showToast('Notificaciones desactivadas', 'success');
    } catch (error) {
      console.error(error);
      showToast('Error al desactivar notificaciones', 'error');
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
    await supabase.auth.signOut();
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const newTask = {
      title,
      assigned_to: assignedTo || null,
      interval_days: intervalDays,
      next_due_date: todayStr, 
      is_completed: false,
    };

    const { error } = await supabase.from('tasks').insert([newTask]);

    if (!error) {
      setTitle('');
      setShowForm(false);
      await refreshData();
      showToast('Tarea guardada exitosamente', 'success');
    } else {
      showToast('Error al crear la tarea', 'error');
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

  const handleDeleteTask = async (taskId: string) => {
    if (!isAdmin) {
      showToast('Solo el administrador puede borrar tareas', 'error');
      return;
    }

    if (!window.confirm('¿Seguro que deseas eliminar esta tarea?')) return;

    const { error } = await supabase.from('tasks').delete().eq('id', taskId);

    if (!error) {
      await refreshData();
      showToast('Tarea eliminada', 'success');
    } else {
      showToast('Error al eliminar la tarea', 'error');
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
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 font-sans relative">
        <ToastNotification toast={toast} />
        
        <div className="w-full max-w-sm bg-slate-900 border border-slate-800 p-8 rounded-3xl shadow-2xl">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-extrabold text-white">Tareas del Hogar</h1>
            <p className="text-sm text-slate-400 mt-1">Inicia sesión para continuar</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Correo electrónico</label>
              <input
                type="email"
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Contraseña</label>
              <input
                type="password"
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-3 rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/25 disabled:opacity-50 mt-2"
            >
              {authLoading ? 'Cargando...' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const todaysTasks = tasks.filter(task => task.next_due_date <= todayStr);
  const upcomingTasks = tasks.filter(task => task.next_due_date > todayStr);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 max-w-md mx-auto font-sans antialiased relative">
      <ToastNotification toast={toast} />

      <header className="mb-6 pt-2 flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">Tareas del Hogar</h1>
          <p className="text-xs font-medium text-slate-400 mt-0.5">Gestión de pendientes</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={pushEnabled ? unsubscribeFromPush : subscribeToPush}
            className={`p-2 rounded-full transition-colors ${
              pushEnabled
                ? 'text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20'
                : 'text-slate-400 hover:text-indigo-400 hover:bg-slate-900'
            }`}
            title={pushEnabled ? 'Desactivar notificaciones' : 'Activar notificaciones'}
          >
            {pushEnabled ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
          </button>
          <button 
            onClick={handleSignOut}
            className="text-slate-400 hover:text-rose-400 p-2 rounded-full hover:bg-slate-900 transition-colors"
            title="Cerrar sesión"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Lista de Tareas */}
      <section className="pb-24">
        {loading ? (
          <div className="p-4 bg-slate-900 border border-slate-800/80 rounded-2xl text-center">
            <p className="text-xs text-slate-500 animate-pulse">Cargando tareas...</p>
          </div>
        ) : tasks.length === 0 ? (
          <div className="p-10 bg-slate-900/50 border border-slate-800/50 rounded-2xl text-center flex flex-col items-center justify-center">
            <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center mb-3">
              <Plus className="w-6 h-6 text-slate-500" />
            </div>
            <p className="text-sm font-medium text-slate-300">Nada por aquí</p>
            <p className="text-xs text-slate-500 mt-1">Presiona el botón + para agregar tareas</p>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <h2 className="text-xs font-bold text-slate-300 tracking-wider uppercase mb-3 pl-1">Para hoy</h2>
              
              {todaysTasks.length === 0 ? (
                <div className="p-6 bg-slate-900/40 border border-slate-800/40 border-dashed rounded-2xl text-center">
                  <p className="text-sm text-slate-400">¡Todo listo por hoy! 🎉</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {todaysTasks.map((task) => (
                    <div key={task.id} className="bg-slate-900 border border-slate-700/80 p-4 rounded-2xl shadow-sm space-y-3 transition-all">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1.5">
                          <h3 className="font-semibold text-sm text-slate-100">{task.title}</h3>
                          <RenderBadge profileId={task.assigned_to} />
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isAdmin && (
                            <button
                              onClick={() => handleDeleteTask(task.id)}
                              className="text-slate-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
                              title="Eliminar tarea"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleCompleteTask(task)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition-all active:scale-95 shrink-0"
                          >
                            <Check className="w-3.5 h-3.5" /> Completar
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2.5 border-t border-slate-800/60 text-[11px]">
                        <span className="text-slate-500">
                          Cada <span className="text-indigo-400/80 font-medium">{task.interval_days} días</span>
                        </span>
                        <span className="text-slate-300 font-medium">
                          {task.next_due_date < todayStr ? 'Atrasada' : 'Hoy'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {upcomingTasks.length > 0 && (
              <div>
                <h2 className="text-xs font-bold text-slate-500 tracking-wider uppercase mb-3 pl-1">Próximas</h2>
                <div className="space-y-3">
                  {upcomingTasks.map((task) => (
                    <div key={task.id} className="bg-slate-900/40 border border-slate-800/40 p-4 rounded-2xl shadow-sm space-y-3 transition-all opacity-75 hover:opacity-100">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1.5">
                          <h3 className="font-semibold text-sm text-slate-400">{task.title}</h3>
                          <RenderBadge profileId={task.assigned_to} />
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {isAdmin && (
                            <button
                              onClick={() => handleDeleteTask(task.id)}
                              className="text-slate-600 hover:text-rose-400 p-1.5 rounded-lg hover:bg-slate-800/60 transition-colors"
                              title="Eliminar tarea"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleUndoTask(task)}
                            title="Mover a hoy manualmente"
                            className="text-slate-500 hover:text-indigo-400 p-1.5 rounded-lg hover:bg-slate-800/60 transition-colors"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2.5 border-t border-slate-800/40 text-[11px]">
                        <span className="text-slate-500">
                          Cada <span className="text-indigo-400/60 font-medium">{task.interval_days} días</span>
                        </span>
                        <span className="text-slate-500 font-medium">
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

      {/* Botón Flotante */}
      <button
        onClick={() => setShowForm(true)}
        className="fixed bottom-8 right-1/2 translate-x-[200px] sm:translate-x-[180px] w-14 h-14 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-indigo-600/30 transition-all active:scale-90 z-40"
        style={{ right: 'max(1.5rem, calc(50% - 200px + 1.5rem))', transform: 'none' }}
      >
        <Plus className="w-7 h-7" />
      </button>

      {/* Modal / Formulario */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <form onSubmit={handleCreateTask} className="bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-2xl w-full max-w-sm space-y-5 relative animate-in fade-in zoom-in-95 duration-200">
            
            <button 
              type="button" 
              onClick={() => setShowForm(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <h2 className="text-lg font-bold text-white">Nueva Tarea</h2>
              <p className="text-xs text-slate-400 mt-1">Completa los datos para registrar un pendiente.</p>
            </div>
            
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Nombre de la tarea</label>
              <input
                type="text"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                placeholder="Ej: Regar las plantas"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Responsable</label>
              <select
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 appearance-none"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
              >
                <option value="">Sin asignar</option>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Frecuencia (días)</label>
              <input
                type="number"
                min="1"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                value={intervalDays}
                onChange={(e) => setIntervalDays(Number(e.target.value))}
                required
              />
            </div>

            <button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white font-medium py-3.5 rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/25 mt-2"
            >
              Guardar Tarea
            </button>
          </form>
        </div>
      )}
    </div>
  );
}