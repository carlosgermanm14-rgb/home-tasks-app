import { Pencil, Trash2, Check, RotateCcw, User } from 'lucide-react';
import type { Task, Profile } from '../types/database';

interface TaskCardProps {
  task: Task;
  profiles: Profile[];
  isAdmin: boolean;
  darkMode: boolean;
  isUpcoming?: boolean;
  daysRemaining?: string;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  onComplete: (task: Task) => void;
  onUndo: (task: Task) => void;
}

export const TaskCard = ({ task, profiles, isAdmin, darkMode, isUpcoming, daysRemaining, onEdit, onDelete, onComplete, onUndo }: TaskCardProps) => {
  const profile = profiles.find((p) => p.id === task.assigned_to);
  const name = profile ? profile.name : 'Sin asignar';
  const isAida = name.toLowerCase().includes('aida');
  const isGeovanny = name.toLowerCase().includes('geovanny');

  let badgeStyle = 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30';
  if (isAida) badgeStyle = 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30';
  if (isGeovanny) badgeStyle = 'bg-sky-500/15 text-sky-300 border-sky-500/30';

  return (
    <div className={`p-4 rounded-2xl shadow-sm space-y-3 transition-all backdrop-blur-sm border ${isUpcoming ? 'opacity-80 hover:opacity-100' : ''} ${darkMode ? 'bg-slate-900/90 border-slate-700/80 shadow-slate-950/20' : 'bg-white border-slate-200 shadow-slate-100'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <h3 className={`font-semibold text-sm ${darkMode ? (isUpcoming ? 'text-slate-400' : 'text-slate-100') : (isUpcoming ? 'text-slate-800' : 'text-slate-900')}`}>{task.title}</h3>
          <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${badgeStyle}`}>
            <User className="w-3 h-3 opacity-70" /> {name}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isAdmin && (
            <>
              <button onClick={() => onEdit(task)} className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'text-slate-500 hover:text-indigo-400 hover:bg-slate-800' : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-100'}`}><Pencil className="w-4 h-4" /></button>
              <button onClick={() => onDelete(task.id)} className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'text-slate-500 hover:text-rose-400 hover:bg-slate-800' : 'text-slate-400 hover:text-rose-600 hover:bg-slate-100'}`}><Trash2 className="w-4 h-4" /></button>
            </>
          )}
          {isUpcoming ? (
            <button onClick={() => onUndo(task)} className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'text-slate-500 hover:text-indigo-400 hover:bg-slate-800/60' : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-100/80'}`}><RotateCcw className="w-4 h-4" /></button>
          ) : (
            <button onClick={() => onComplete(task)} className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-3 py-1.5 rounded-xl text-xs flex items-center gap-1 shadow-md shadow-emerald-600/20 transition-all active:scale-95 shrink-0 ml-1"><Check className="w-3.5 h-3.5" /> Completar</button>
          )}
        </div>
      </div>
      <div className={`flex items-center justify-between pt-2.5 border-t text-[11px] ${darkMode ? 'border-slate-800/60' : 'border-slate-100'}`}>
        <span className={`${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>Cada <span className={`${darkMode ? 'text-indigo-400/80 font-medium' : 'text-indigo-600 font-medium'}`}>{task.interval_days} días</span></span>
        <span className={`${darkMode ? 'text-slate-300 font-medium' : 'text-slate-700 font-medium'}`}>{isUpcoming ? daysRemaining : 'Hoy'}</span>
      </div>
    </div>
  );
};