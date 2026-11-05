import { ArrowRight, BookOpenCheck, Check, Eye, EyeOff, LockKeyhole, Sparkles } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button, Logo, Spinner } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Moon, Sun } from 'lucide-react';

export default function Login() {
  const { user, loading: authLoading, login, signup } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (authLoading) return <div className="flex min-h-screen items-center justify-center"><Spinner /></div>;
  if (user) return <Navigate to="/" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'login') await login(email, password);
      else await signup(name, email, password);
      navigate('/');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to sign in');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-surface">
      <section className="relative hidden w-[46%] overflow-hidden bg-[#26352b] p-12 text-white lg:flex lg:flex-col xl:p-16">
        <div className="absolute -right-28 -top-28 h-96 w-96 rounded-full bg-emerald-200/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-24 h-[480px] w-[480px] rounded-full bg-emerald-100/5 blur-3xl" />
        <Logo className="relative text-white [&>span:first-child]:bg-white/15" />
        <div className="relative my-auto max-w-lg">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-emerald-50"><Sparkles size={14} />A calmer way to learn</div>
          <h1 className="text-5xl font-semibold leading-[1.08] tracking-[-.05em] xl:text-6xl">Make space for<br />what matters.</h1>
          <p className="mt-6 max-w-md text-base leading-7 text-emerald-50/70">Turn scattered materials into a focused plan. Your notes, schedule, files, and personal study tutor—in one private workspace.</p>
          <div className="mt-10 space-y-4">
            {['A study plan that adapts to your goals', 'Answers with citations from your own files', 'Self-hosted, private, and always yours'].map((item) => <div key={item} className="flex items-center gap-3 text-sm text-emerald-50/85"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10"><Check size={12} /></span>{item}</div>)}
          </div>
        </div>
        <p className="relative text-xs text-emerald-50/45">Less organizing. More understanding.</p>
      </section>

      <section className="relative flex flex-1 items-center justify-center bg-canvas px-5 py-10 sm:px-10">
        <button className="icon-btn absolute right-5 top-5" onClick={toggleTheme} aria-label="Toggle color theme">{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
        <div className="w-full max-w-[400px] animate-slide-up">
          <Logo className="mb-10 lg:hidden" />
          <div className="mb-8">
            <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-2xl border border-line bg-surface text-accent shadow-soft">{mode === 'login' ? <LockKeyhole size={20} /> : <BookOpenCheck size={20} />}</div>
            <h2 className="text-3xl font-semibold tracking-[-.04em]">{mode === 'login' ? 'Welcome back' : 'Create your space'}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{mode === 'login' ? 'Pick up right where you left off.' : 'A fresh start for your best work yet.'}</p>
          </div>
          <form onSubmit={submit} className="space-y-4">
            {mode === 'signup' && <div><label className="label" htmlFor="name">Your name</label><input id="name" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="How should we greet you?" required maxLength={80} autoComplete="name" /></div>}
            <div><label className="label" htmlFor="email">Email address</label><input id="email" type="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email" /></div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <div className="relative"><input id="password" type={showPassword ? 'text' : 'password'} className="field pr-11" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'} minLength={8} maxLength={72} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /><button type="button" onClick={() => setShowPassword(!showPassword)} className="icon-btn absolute right-1 top-1" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
            </div>
            {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
            <Button type="submit" className="w-full" loading={submitting}>{mode === 'login' ? 'Sign in to StudyOS' : 'Create my workspace'}<ArrowRight size={16} /></Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted">{mode === 'login' ? 'New to StudyOS?' : 'Already have an account?'} <button className="font-semibold text-accent hover:underline" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button></p>
          <p className="mt-10 text-center text-[11px] leading-5 text-muted">Your account is local to this StudyOS server.<br />No tracking. No third-party analytics.</p>
        </div>
      </section>
    </div>
  );
}
