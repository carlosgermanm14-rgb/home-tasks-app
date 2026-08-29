import { useState } from 'react';
import { User, Lock } from 'lucide-react';
import { supabase } from '../supabaseClient';

export const LoginScreen = ({ showToast }: { showToast: (msg: string, type: 'error') => void }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) showToast('Correo o contraseña incorrectos', 'error');
    setAuthLoading(false);
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-end items-center p-4 font-sans select-none bg-[#bce1fa] bg-top bg-cover bg-no-repeat relative" style={{ backgroundImage: "url('/fondo_login.webp')" }}>
      <div className="w-full max-w-sm bg-white rounded-[32px] p-6 shadow-2xl border border-sky-100/80 mb-4 sm:mb-8 relative z-10">
        <h2 className="text-center font-bold text-slate-800 text-sm mb-5">¡Hola! Inicia sesión para continuar.</h2>
        <form onSubmit={handleAuth} className="space-y-3.5">
          <div className="relative">
            <User className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-sky-400" />
            <input type="email" required placeholder="Usuario o Correo" className="w-full bg-[#f0f7fd] border border-sky-100 rounded-2xl py-3.5 pl-11 pr-4 text-[16px] font-medium text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-300 transition-all" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="relative">
            <Lock className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-sky-400" />
            <input type="password" required placeholder="Contraseña" className="w-full bg-[#f0f7fd] border border-sky-100 rounded-2xl py-3.5 pl-11 pr-4 text-[16px] font-medium text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-300 transition-all" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button type="submit" disabled={authLoading} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs tracking-wider uppercase py-4 rounded-2xl shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 mt-1">
            {authLoading ? 'CARGANDO...' : 'INICIAR SESIÓN'}
          </button>
        </form>
      </div>
    </div>
  );
};