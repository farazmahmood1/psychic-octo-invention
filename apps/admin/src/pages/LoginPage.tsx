import { useState, type FormEvent } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { ApiClientError } from '@/api/client';
import { ClawdbotMascot } from '@/components/ClawdbotMascot';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  if (!isLoading && isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.code === 'TOO_MANY_REQUESTS'
          ? 'Too many login attempts. Please wait and try again.'
          : 'Invalid email or password');
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-[#0F2942] via-[#1E3A5F] to-[#2A5080]">
      {/* Animated background orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-20 -top-20 h-72 w-72 animate-pulse rounded-full bg-[#4A9FF5]/10 blur-3xl" />
        <div className="absolute -bottom-32 -right-20 h-96 w-96 animate-pulse rounded-full bg-[#3B7DD8]/10 blur-3xl" style={{ animationDelay: '1s' }} />
        <div className="absolute left-1/2 top-1/4 h-64 w-64 animate-pulse rounded-full bg-[#7BBFFF]/5 blur-3xl" style={{ animationDelay: '2s' }} />
      </div>

      {/* Card + Mascot container */}
      <div className="relative mx-4 w-full max-w-md">
        {/* Clawdbot peeking from the right */}
        <div className="absolute -right-8 -top-16 z-10 hidden sm:block md:-right-16">
          <ClawdbotMascot className="h-40 w-auto drop-shadow-2xl transition-transform duration-500 hover:scale-110 md:h-48" />
        </div>

        {/* Glass card */}
        <div className="relative rounded-3xl border border-white/20 bg-white/10 p-8 shadow-2xl shadow-black/20 backdrop-blur-xl">
          {/* Inner glow */}
          <div className="pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-br from-white/10 via-transparent to-transparent" />

          <div className="relative z-10">
            {/* Header */}
            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4A9FF5] to-[#2A5080] shadow-lg shadow-[#4A9FF5]/25">
                <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white">OpenClaw Admin</h1>
              <p className="mt-1 text-sm text-[#7BBFFF]/80">Sign in to your admin account</p>
            </div>

            {/* Form */}
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
              {error && (
                <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200 backdrop-blur-sm">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium text-[#7BBFFF]">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  autoComplete="email"
                  required
                  disabled={submitting}
                  className="h-12 w-full rounded-2xl border border-white/15 bg-white/5 px-4 text-sm text-white placeholder-white/30 outline-none backdrop-blur-sm transition-all duration-300 focus:border-[#4A9FF5]/60 focus:bg-white/10 focus:ring-2 focus:ring-[#4A9FF5]/25 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium text-[#7BBFFF]">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                  disabled={submitting}
                  className="h-12 w-full rounded-2xl border border-white/15 bg-white/5 px-4 text-sm text-white placeholder-white/30 outline-none backdrop-blur-sm transition-all duration-300 focus:border-[#4A9FF5]/60 focus:bg-white/10 focus:ring-2 focus:ring-[#4A9FF5]/25 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="h-12 w-full rounded-2xl bg-gradient-to-r from-[#3B7DD8] to-[#4A9FF5] text-sm font-semibold text-white shadow-lg shadow-[#3B7DD8]/30 transition-all duration-300 hover:shadow-xl hover:shadow-[#4A9FF5]/30 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                      <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
                    </svg>
                    Signing in...
                  </span>
                ) : (
                  'Sign in'
                )}
              </button>
            </form>

            {/* Footer */}
            <p className="mt-6 text-center text-xs text-white/30">
              Secured by OpenClaw
            </p>
          </div>
        </div>

        {/* Clawdbot for mobile - below card */}
        <div className="mt-6 flex justify-center sm:hidden">
          <ClawdbotMascot className="h-28 w-auto opacity-60" />
        </div>
      </div>
    </div>
  );
}
