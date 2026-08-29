import { Sun, Moon, Bell, BellOff, LogOut } from 'lucide-react';

interface HeaderProps {
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
  pushEnabled: boolean;
  onTogglePush: () => void;
  onSignOut: () => void;
}

export const Header = ({ darkMode, setDarkMode, pushEnabled, onTogglePush, onSignOut }: HeaderProps) => (
  <header className="mb-6 pt-2 flex justify-between items-start gap-4">
    <div>
      <h1 className={`text-2xl font-extrabold tracking-tight ${darkMode ? 'text-white' : 'text-slate-950'}`}>Tareas del Hogar</h1>
      <p className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'} mt-0.5`}>Gestión de pendientes</p>
    </div>
    <div className="flex items-center gap-1.5 shrink-0">
      <button onClick={() => setDarkMode(!darkMode)} className={`p-2 rounded-full backdrop-blur-sm transition-colors ${darkMode ? 'bg-slate-800/80 text-amber-400 hover:bg-slate-700/80' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`} title={darkMode ? "Activar modo claro" : "Activar modo oscuro"}>
        {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </button>
      <button onClick={onTogglePush} className={`p-2 rounded-full transition-colors ${pushEnabled ? (darkMode ? 'text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20' : 'text-emerald-600 bg-emerald-100 hover:bg-emerald-200') : (darkMode ? 'text-slate-400 hover:text-indigo-400 hover:bg-slate-900' : 'text-slate-500 hover:text-indigo-600 hover:bg-slate-200')}`} title={pushEnabled ? 'Desactivar notificaciones' : 'Activar notificaciones'}>
        {pushEnabled ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
      </button>
      <button onClick={onSignOut} className={`p-2 rounded-full transition-colors ${darkMode ? 'text-slate-400 hover:text-rose-400 hover:bg-slate-900' : 'text-slate-500 hover:text-rose-600 hover:bg-slate-200'}`} title="Cerrar sesión">
        <LogOut className="w-5 h-5" />
      </button>
    </div>
  </header>
);