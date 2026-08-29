import { useState, useMemo } from 'react';
import { Plus, X, Trash2 } from 'lucide-react';
import { supabase } from './supabaseClient';
import { getTodayFormatted, getDaysRemaining } from './utils/helpers';
import { useAuth, useTasks, usePushNotifications } from './hooks/useAppHooks';
import { ToastNotification, type ToastData } from './components/ToastNotification';
import { LoginScreen } from './components/LoginScreen';
import { Header } from './components/Header';
import { AdminPanel } from './components/AdminPanel';
import { TaskCard } from './components/TaskCard';
import type { Task } from './types/database';

const ADMIN_EMAIL = 'carlosgermanm14@gmail.com';

export default function App() {
  const [darkMode, setDarkMode] = useState(true);
  const [toast, setToast] = useState<ToastData>(null);
  
  // Custom Hooks
  const { session } = useAuth();
  const { profiles, tasks, loading, refreshData } = useTasks(session);

  // Estados de Modales
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskToDeleteId, setTaskToDeleteId] = useState<string | null>(null);

  // Estados de Formulario
  const todayStr = getTodayFormatted();
  const [title, setTitle] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [intervalDays, setIntervalDays] = useState(7);
  const [startDate, setStartDate] = useState(todayStr);

  const isAdmin = session?.user?.email === ADMIN_EMAIL;

  // SOLUCIÓN: Eliminamos el `any` y ponemos el tipado estricto
  function showToast(
    message: string,
    type: 'success' | 'error' | 'info' = 'success',
    action?: { label: string; onClick: () => void }
  ) {
    setToast({ message, type, action });
    setTimeout(() => setToast(null), action ? 5000 : 3000);
  }

  // Hook de Notificaciones usa el showToast ya tipado
  const { pushEnabled, subscribeToPush, unsubscribeFromPush } = usePushNotifications(session, showToast);

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
      if (i === 0) label = 'Hoy';
      else if (i === 1) label = 'Mañana';
      else {
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

  const handleSignOut = async () => {
    if (pushEnabled) await unsubscribeFromPush(true);
    await supabase.auth.signOut();
  };

  const handleOpenCreateModal = () => {
    if (!isAdmin) { showToast('Solo el administrador puede crear tareas', 'error'); return; }
    setEditingTask(null); setTitle(''); setAssignedTo(''); setIntervalDays(7); setStartDate(todayStr); setShowForm(true);
  };

  const handleOpenEditModal = (task: Task) => {
    if (!isAdmin) { showToast('Solo el administrador puede editar tareas', 'error'); return; }
    setEditingTask(task); setTitle(task.title); setAssignedTo(task.assigned_to || ''); setIntervalDays(task.interval_days); setStartDate(task.next_due_date); setShowForm(true);
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (!title.trim() || !assignedTo || !startDate) { showToast('Completa todos los campos obligatorios', 'error'); return; }

    if (editingTask) {
      const { error } = await supabase.from('tasks').update({ title: title.trim(), assigned_to: assignedTo, interval_days: intervalDays, next_due_date: startDate }).eq('id', editingTask.id);
      if (!error) { setShowForm(false); await refreshData(); showToast('Tarea actualizada', 'success'); }
    } else {
      const { error } = await supabase.from('tasks').insert([{ title: title.trim(), assigned_to: assignedTo, interval_days: intervalDays, next_due_date: startDate, is_completed: false }]);
      if (!error) { setShowForm(false); await refreshData(); showToast('Tarea guardada', 'success'); }
    }
  };

  const handleCompleteTask = async (task: Task) => {
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + task.interval_days);
    const nextDueDateString = nextDate.toISOString().split('T')[0];
    await supabase.from('task_logs').insert([{ task_id: task.id, completed_by: task.assigned_to }]);
    const { error } = await supabase.from('tasks').update({ next_due_date: nextDueDateString }).eq('id', task.id);
    if (!error) {
      await refreshData();
      showToast(`"${task.title}" completada 🎉`, 'success', { label: 'Deshacer', onClick: () => handleUndoTask(task) });
    }
  };

  const handleUndoTask = async (task: Task) => {
    const { error } = await supabase.from('tasks').update({ next_due_date: todayStr }).eq('id', task.id);
    if (!error) { await refreshData(); showToast(`Tarea reasignada a Hoy`, 'success'); }
  };

  const confirmDeleteTask = async () => {
    if (!taskToDeleteId || !isAdmin) return;
    const { error } = await supabase.from('tasks').delete().eq('id', taskToDeleteId);
    setTaskToDeleteId(null);
    if (!error) { await refreshData(); showToast('Tarea eliminada', 'success'); }
  };

  if (!session) return <LoginScreen showToast={showToast} />;

  const todaysTasks = tasks.filter(task => task.next_due_date <= todayStr);
  const upcomingTasks = tasks.filter(task => task.next_due_date > todayStr);
  const currentUserProfile = profiles.find(p => p.user_id === session?.user?.id);
  
  const myTodaysTasks = todaysTasks.filter(task => task.assigned_to === currentUserProfile?.id);
  const othersTodaysTasks = todaysTasks.filter(task => task.assigned_to !== currentUserProfile?.id);
  const myUpcomingTasks = upcomingTasks.filter(task => task.assigned_to === currentUserProfile?.id);
  const othersUpcomingTasks = upcomingTasks.filter(task => task.assigned_to !== currentUserProfile?.id);

  return (
    <div className={`min-h-screen relative font-sans antialiased ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'}`}>
      <div className="fixed inset-0 z-0 opacity-[0.04] pointer-events-none bg-slate-950 bg-repeat bg-center" style={{ backgroundImage: "url('/fondo_login.webp')", opacity: darkMode ? 0.04 : 0.02 }}></div>
      <div className="relative z-10 p-4 max-w-md mx-auto pb-20">
        
        <ToastNotification toast={toast} />
        
        <Header darkMode={darkMode} setDarkMode={setDarkMode} pushEnabled={pushEnabled} onTogglePush={pushEnabled ? unsubscribeFromPush : subscribeToPush} onSignOut={handleSignOut} />

        {isAdmin && <AdminPanel session={session} darkMode={darkMode} showToast={showToast} />}

        <section className="pb-16">
          {loading ? ( <div className={`p-4 border rounded-2xl text-center ${darkMode ? 'bg-slate-900/80 border-slate-800/80' : 'bg-white border-slate-200'}`}><p className={`text-xs animate-pulse ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>Cargando tareas...</p></div> ) 
          : tasks.length === 0 ? ( <div className={`p-10 border rounded-2xl text-center flex flex-col items-center justify-center ${darkMode ? 'bg-slate-900/60 border-slate-800/60' : 'bg-white border-slate-200'}`}><div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}><Plus className={`w-6 h-6 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} /></div><p className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Nada por aquí</p><p className={`text-xs mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>{isAdmin ? 'Presiona el botón + para agregar tareas' : 'Cuando se agreguen tareas las verás aquí'}</p></div> ) : (
            <>
              {/* TAREAS DE HOY */}
              <div className="mb-8">
                <h2 className={`text-xs font-bold tracking-wider uppercase mb-3 pl-1 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Para hoy</h2>
                {todaysTasks.length === 0 ? (
                  <div className={`p-6 border border-dashed rounded-2xl text-center ${darkMode ? 'bg-slate-900/60 border-slate-800/60' : 'bg-white/80 border-slate-200'}`}>
                    <p className={`text-sm font-medium ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>¡Toda la casa está lista por hoy! 🎉</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {currentUserProfile && myTodaysTasks.length === 0 && othersTodaysTasks.length > 0 && (
                      <div className={`p-4 rounded-2xl text-center border ${darkMode ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-emerald-50 border-emerald-200'}`}>
                        <p className={`text-sm font-semibold ${darkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>¡Terminaste tus tareas de hoy! 🎉</p>
                      </div>
                    )}
                    <div className="space-y-3">
                      {[...myTodaysTasks, ...othersTodaysTasks].map((task) => (
                        <TaskCard key={task.id} task={task} profiles={profiles} isAdmin={isAdmin} darkMode={darkMode} onEdit={handleOpenEditModal} onDelete={() => setTaskToDeleteId(task.id)} onComplete={handleCompleteTask} onUndo={handleUndoTask} />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* PRÓXIMAS TAREAS */}
              {upcomingTasks.length > 0 && (
                <div>
                  <h2 className={`text-xs font-bold tracking-wider uppercase mb-3 pl-1 ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>Próximas</h2>
                  <div className="space-y-3">
                    {[...myUpcomingTasks, ...othersUpcomingTasks].map((task) => (
                      <TaskCard key={task.id} task={task} profiles={profiles} isAdmin={isAdmin} darkMode={darkMode} isUpcoming daysRemaining={getDaysRemaining(task.next_due_date)} onEdit={handleOpenEditModal} onDelete={() => setTaskToDeleteId(task.id)} onComplete={handleCompleteTask} onUndo={handleUndoTask} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {isAdmin && (
          <button onClick={handleOpenCreateModal} className={`fixed bottom-6 right-1/2 translate-x-[180px] sm:translate-x-[160px] w-14 h-14 rounded-full flex items-center justify-center transition-all z-40 ${darkMode ? 'bg-slate-100 text-slate-950' : 'bg-slate-950 text-white'}`}>
            <Plus className="w-7 h-7" />
          </button>
        )}

        {/* MODAL DE ELIMINAR */}
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
                <button type="button" onClick={() => setTaskToDeleteId(null)} className={`w-1/2 font-medium py-3 rounded-xl text-xs transition-all ${darkMode ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}>Cancelar</button>
                <button type="button" onClick={confirmDeleteTask} className="w-1/2 bg-rose-600 hover:bg-rose-500 text-white font-medium py-3 rounded-xl text-xs transition-all shadow-lg shadow-rose-600/25">Eliminar</button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL DE FORMULARIO */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <form onSubmit={handleSaveTask} className={`p-6 rounded-3xl shadow-2xl w-full max-w-sm space-y-4 relative animate-in fade-in zoom-in-95 duration-200 z-50 border ${darkMode ? 'bg-slate-900 border-slate-700/50 backdrop-blur-md shadow-slate-950/30' : 'bg-white border-slate-100 shadow-slate-200'}`}>
              <button type="button" onClick={() => setShowForm(false)} className={`absolute top-4 right-4 p-1 rounded-full hover:bg-slate-800 transition-colors ${darkMode ? 'text-slate-400 hover:text-white' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}><X className="w-5 h-5" /></button>
              <div>
                <h2 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-slate-950'}`}>{editingTask ? 'Editar Tarea' : 'Nueva Tarea'}</h2>
                <p className={`text-xs mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>{editingTask ? 'Modifica los datos de la actividad' : 'Completa todos los campos obligatorios'}</p>
              </div>
              <div>
                <label className={`block text-xs font-medium mb-1.5 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Nombre de la tarea *</label>
                <input type="text" className={`w-full rounded-xl p-3 text-[16px] focus:outline-none focus:ring-2 transition-all ${darkMode ? 'bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-600 focus:ring-indigo-500/50' : 'bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:ring-indigo-300'}`} placeholder="Ej: Lavar el carro" value={title} onChange={(e) => setTitle(e.target.value)} required />
              </div>
              <div>
                <label className={`block text-xs font-medium mb-1.5 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Responsable *</label>
                <select className={`w-full rounded-xl p-3 text-[16px] focus:outline-none focus:ring-2 transition-all appearance-none ${darkMode ? 'bg-slate-950 border border-slate-800 text-slate-100 focus:ring-indigo-500/50' : 'bg-slate-50 border border-slate-200 text-slate-900 focus:ring-indigo-300'}`} value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} required>
                  <option value="" disabled className={darkMode ? 'bg-slate-900' : 'bg-white'}>Selecciona un responsable</option>
                  {profiles.map((profile) => (<option key={profile.id} value={profile.id} className={darkMode ? 'bg-slate-900' : 'bg-white'}>{profile.name}</option>))}
                </select>
              </div>
              <div>
                <label className={`block text-xs font-medium mb-1.5 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>¿Cuándo inicia? *</label>
                <select className={`w-full rounded-xl p-3 text-[16px] focus:outline-none focus:ring-2 transition-all appearance-none ${darkMode ? 'bg-slate-950 border border-slate-800 text-slate-100 focus:ring-indigo-500/50' : 'bg-slate-50 border border-slate-200 text-slate-900 focus:ring-indigo-300'}`} value={startDate} onChange={(e) => setStartDate(e.target.value)} required>
                  {dateOptions.map((opt) => (<option key={opt.value} value={opt.value} className={darkMode ? 'bg-slate-900' : 'bg-white'}>{opt.label}</option>))}
                </select>
              </div>
              <div>
                <label className={`block text-xs font-medium mb-1.5 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Frecuencia en días *</label>
                <input type="number" min="1" className={`w-full rounded-xl p-3 text-[16px] focus:outline-none focus:ring-2 transition-all ${darkMode ? 'bg-slate-950 border border-slate-800 text-slate-100 focus:ring-indigo-500/50' : 'bg-slate-50 border border-slate-200 text-slate-900 focus:ring-indigo-300'}`} value={intervalDays} onChange={(e) => setIntervalDays(Number(e.target.value))} required />
              </div>
              <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white font-medium py-3.5 rounded-xl text-sm transition-all shadow-lg mt-2">{editingTask ? 'Actualizar Tarea' : 'Guardar Tarea'}</button>
            </form>
          </div>
        )}

      </div>
    </div>
  );
}