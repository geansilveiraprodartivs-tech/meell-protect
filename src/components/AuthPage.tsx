import { useState, useEffect } from 'react';
import { Mail, Lock, ArrowLeft, User, Shield, ShoppingBag, Eye, EyeOff } from 'lucide-react';
import Logo from './Logo';
import { supabase } from '../lib/supabase';
import { toast } from './Toaster';
import type { AccountType } from '../lib/types';

interface Props {
  mode: 'login' | 'signup' | 'recovery';
  navigate: (to: string) => void;
}

export default function AuthPage({ mode, navigate }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(false);
  const [name, setName] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('creator');
  const [loading, setLoading] = useState(false);

  // Restaurar e-mail lembrado (apenas no modo login)
  useEffect(() => {
    if (mode === 'login') {
      const remembered = localStorage.getItem('meell_remember') === 'true';
      const savedEmail = localStorage.getItem('meell_email') ?? '';
      if (remembered && savedEmail) {
        setEmail(savedEmail);
        setRememberEmail(true);
      }
    }
  }, [mode]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'recovery') {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) throw error;
        toast('Enviamos um e-mail de recuperação para você.', 'success');
        navigate('/login');
        return;
      }
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name, account_type: accountType } },
        });
        if (error) throw error;
        if (data.user) {
          await supabase.from('profiles').upsert({
            id: data.user.id,
            email,
            display_name: name || null,
            account_type: accountType,
            plan_id: accountType === 'creator' ? 'free' : 'free',
            trial_ends_at: accountType === 'creator' ? new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString() : null,
          });
        }
        toast('Conta criada! Bem-vindo ao Meell Protect.', 'success');
        navigate('/app');
        return;
      }
      // login
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // Salvar ou limpar e-mail lembrado (nunca salva a senha)
      if (rememberEmail) {
        localStorage.setItem('meell_remember', 'true');
        localStorage.setItem('meell_email', email);
      } else {
        localStorage.removeItem('meell_remember');
        localStorage.removeItem('meell_email');
      }
      toast('Bem-vindo de volta!', 'success');

      const currentHash = window.location.hash;
      const queryString = currentHash.includes('?')
        ? currentHash.substring(currentHash.indexOf('?'))
        : '';

      navigate(`/app${queryString}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro inesperado';
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }

  const isLogin = mode === 'login';
  const isSignup = mode === 'signup';

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex items-center justify-between px-5 py-4">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-sm text-meell-500 hover:text-meell-700">
          <ArrowLeft size={16} /> Voltar
        </button>
        <Logo />
      </div>

      <div className="flex flex-1 items-center justify-center px-5 py-8">
        <div className="w-full max-w-md animate-fadeUp">
          <div className="card">
            <h1 className="text-2xl font-bold text-meell-800">
              {isLogin ? 'Entrar' : isSignup ? 'Criar conta' : 'Recuperar senha'}
            </h1>
            <p className="mt-1 text-sm text-meell-500">
              {isLogin
                ? 'Acesse seu painel Meell Protect.'
                : isSignup
                ? 'Comece a proteger seus arquivos digitais.'
                : 'Enviaremos um link de recuperação para seu e-mail.'}
            </p>

            {isSignup && (
              <div className="mt-5">
                <div className="label">Tipo de conta</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAccountType('creator')}
                    className={`flex flex-col items-start gap-1 rounded-2xl p-3 text-left ring-1 transition ${
                      accountType === 'creator'
                        ? 'bg-meell-50 ring-meell-300'
                        : 'bg-white ring-meell-100 hover:bg-meell-50/50'
                    }`}
                  >
                    <Shield size={18} className="text-meell-500" />
                    <span className="text-sm font-semibold text-meell-800">Criador/Vendedor</span>
                    <span className="text-[11px] text-meell-400">Assina para proteger e entregar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccountType('client')}
                    className={`flex flex-col items-start gap-1 rounded-2xl p-3 text-left ring-1 transition ${
                      accountType === 'client'
                        ? 'bg-lilas-50 ring-lilas-300'
                        : 'bg-white ring-meell-100 hover:bg-lilas-50/50'
                    }`}
                  >
                    <ShoppingBag size={18} className="text-lilas-500" />
                    <span className="text-sm font-semibold text-meell-800">Cliente final</span>
                    <span className="text-[11px] text-meell-400">Conta gratuita para baixar</span>
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={submit} className="mt-5 space-y-4">
              {isSignup && (
                <div>
                  <label className="label">Nome</label>
                  <div className="relative">
                    <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-meell-300" />
                    <input
                      className="input pl-10"
                      placeholder="Seu nome"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}
              <div>
                <label className="label">E-mail</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-meell-300" />
                  <input
                    type="email"
                    className="input pl-10"
                    placeholder="voce@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>
              {mode !== 'recovery' && (
                <div>
                  <label className="label">Senha</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-meell-300" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="input pl-10 pr-10"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-meell-300 hover:text-meell-500 transition"
                      tabIndex={-1}
                      aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              )}

              {isLogin && (
                <label className="flex cursor-pointer items-center gap-2 text-sm text-meell-500">
                  <input
                    type="checkbox"
                    checked={rememberEmail}
                    onChange={(e) => setRememberEmail(e.target.checked)}
                    className="rounded accent-meell-500"
                  />
                  Lembrar meu e-mail
                </label>
              )}

              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? 'Aguarde...' : isLogin ? 'Entrar' : isSignup ? 'Criar conta' : 'Enviar link'}
              </button>
            </form>

            <div className="mt-5 space-y-2 text-center text-sm text-meell-500">
              {isLogin && (
                <>
                  <button onClick={() => navigate('/recovery')} className="hover:text-meell-700">
                    Esqueci minha senha
                  </button>
                  <div>
                    Não tem conta?{' '}
                    <button onClick={() => navigate('/signup')} className="font-semibold text-meell-600 hover:text-meell-700">
                      Criar agora
                    </button>
                  </div>
                </>
              )}
              {isSignup && (
                <div>
                  Já tem conta?{' '}
                  <button onClick={() => navigate('/login')} className="font-semibold text-meell-600 hover:text-meell-700">
                    Entrar
                  </button>
                </div>
              )}
              {mode === 'recovery' && (
                <div>
                  Lembrou a senha?{' '}
                  <button onClick={() => navigate('/login')} className="font-semibold text-meell-600 hover:text-meell-700">
                    Voltar para login
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
