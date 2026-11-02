import React, { useState } from 'react';
import { Timer, ShieldCheck, Terminal, BookOpen, Sparkles, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const LoginView: React.FC = () => {
  const { signInWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    try {
      setLoading(true);
      setError(null);
      await signInWithGoogle();
    } catch (err: unknown) {
      console.error(err);
      setError('Failed to authenticate with Google. Please ensure popups are allowed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#090a0f] text-slate-100 flex flex-col justify-center items-center p-6 relative overflow-hidden">
      {/* Subtle grid background */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="w-full max-w-md relative z-10">
        {/* Logo and App Title */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-500 flex items-center justify-center shadow-lg shadow-blue-500/20 mb-4 border border-blue-400/30">
            <Timer className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white font-mono">CHRONOS</h1>
          <p className="text-sm text-slate-400 mt-1">
            Personal Time Tracking & Productivity Architecture
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-[#0d1117] border border-[#21262d] rounded-2xl p-8 shadow-2xl backdrop-blur-xl">
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-white">Sign In to Your Workspace</h2>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Your personal productivity database is strictly private and secured through Firebase Authentication and Cloud Firestore rules.
              </p>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-950/40 border border-rose-800/40 text-rose-300 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={handleSignIn}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-[#161b22] hover:bg-[#1f2530] border border-[#30363d] text-white text-sm font-medium transition-all shadow-sm hover:border-[#388bfd]/50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>{loading ? 'Authenticating...' : 'Continue with Google'}</span>
            </button>
          </div>

          <div className="mt-8 pt-6 border-t border-[#21262d] space-y-3">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Tailored for Personal Engineering:
            </p>
            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-[#161b22]/60 border border-[#21262d]">
                <Terminal className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span className="truncate">Pen Testing & Labs</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-[#161b22]/60 border border-[#21262d]">
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="truncate">CTF Competitions</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-[#161b22]/60 border border-[#21262d]">
                <BookOpen className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate">Study & Academia</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-lg bg-[#161b22]/60 border border-[#21262d]">
                <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="truncate">Personal Projects</span>
              </div>
            </div>
            <p className="text-[10px] text-slate-500 text-center pt-2">
              Starts completely empty. You define your projects, tasks, and boundaries.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
