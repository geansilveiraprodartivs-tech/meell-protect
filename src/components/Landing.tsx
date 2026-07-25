import { useEffect, useState } from 'react';
import {
  Shield, Lock, FileCheck2, Send, Eye, Download, BarChart3, Check,
  Sparkles, ChevronDown, Menu, X, ArrowRight, Star, Zap, Clock, UserCheck,
  Quote,
} from 'lucide-react';
import Logo from './Logo';
import { supabase } from '../lib/supabase';
import type { Plan } from '../lib/types';

interface Props {
  navigate: (to: string) => void;
}

const testimonials = [
  { name: "Maria S.", role: "Infoprodutora", text: "O Meell Protect me deu controle total sobre quem acessa meus materiais. Descobri que 3 clientes estavam compartilhando!" },
  { name: "Carlos M.", role: "Designer Freelancer", text: "Agora meus clientes recebem arquivos protegidos com marca d'água. Profissionalismo que faz diferença." },
  { name: "Ana P.", role: "Coach Digital", text: "O rastreamento de compartilhamentos mudou meu negócio. Sei exatamente quem está usando meus conteúdos." },
];

const stats = [
  { number: "10.000+", label: "Arquivos Protegidos" },
  { number: "5.000+", label: "Entregas Realizadas" },
  { number: "99.9%", label: "Uptime" },
  { number: "24h", label: "Suporte" },
];

const FAQ = [
  {
    q: 'O que é o Meell Protect?',
    a: 'É uma plataforma para criadores, designers e papelarias digitais protegerem arquivos como PDFs, planners e kits, entregando de forma segura e rastreando quem baixou e quando.',
  },
  {
    q: 'Como funciona a entrega segura?',
    a: 'Você protege o arquivo, cadastra o cliente e cria uma entrega. O cliente recebe um link do Meell Protect, entra ou cria a conta gratuita e baixa o arquivo pela sua "Minha Biblioteca". O link nunca é público e permanente.',
  },
  {
    q: 'Posso limitar downloads ou expirar o acesso?',
    a: 'Sim. Cada entrega pode ter limite de downloads, data de expiração e revogação manual. Tudo fica registrado no rastreamento.',
  },
  {
    q: 'O cliente final paga algo?',
    a: 'Não. O cliente final cria uma conta gratuita e acessa a "Minha Biblioteca" com todos os arquivos que recebeu de diferentes criadores.',
  },
  {
    q: 'Como funciona a assinatura?',
    a: 'A assinatura é mensal e recorrente, estilo Netflix. Há 4 planos: Grátis, Protect Start, Protect Pro (mais popular) e Protect Business. A arquitetura já está preparada para pagamentos recorrentes.',
  },
];

const STEPS = [
  { icon: Shield, title: 'Proteja', desc: 'Faça upload e gere um ID exclusivo Meell Protect com marca d\'água e identificação individual.' },
  { icon: Send, title: 'Entregue', desc: 'Cadastre o cliente e crie uma entrega segura com limite de downloads e expiração.' },
  { icon: Lock, title: 'Controle', desc: 'Revogue, renove e acompanhe acessos. O cliente só baixa pela própria conta, nunca por link público.' },
  { icon: BarChart3, title: 'Rastreie', desc: 'Veja a linha do tempo completa: enviado → protegido → autorizado → acessado → baixado.' },
];

const BENEFITS = [
  { icon: FileCheck2, title: 'Proteção por arquivo', desc: 'Cada arquivo recebe um ID Meell Protect e cópias individuais rastreáveis.' },
  { icon: Eye, title: 'Rastreamento completo', desc: 'Saiba quem acessou, quando baixou e quantas vezes, em tempo real.' },
  { icon: Download, title: 'Biblioteca do cliente', desc: 'Seus clientes têm uma área gratuita e organizada com tudo que receberam.' },
  { icon: Clock, title: 'Expiração e limites', desc: 'Defina prazos, limites de download e revogue entregas a qualquer momento.' },
  { icon: UserCheck, title: 'Entrega autenticada', desc: 'O download só funciona para o cliente autorizado e autenticado no site.' },
  { icon: Sparkles, title: 'Identidade Meell', desc: 'Visual premium rosa + lilás, parte do ecossistema Agenda Creator Pro.' },
];

export default function Landing({ navigate }: Props) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const scrollTo = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    supabase
      .from('plans')
      .select('*')
      .order('sort_order', { ascending: true })
      .then(({ data }) => {
        if (data) setPlans(data as Plan[]);
      });
  }, []);

  return (
    <div className="min-h-screen bg-gradient-hero">
      {/* ── Navbar ─────────────────────────────────────────── */}
      <header className="fixed inset-x-0 top-0 z-50 glass border-b border-white/30">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <Logo />
          <nav className="hidden items-center gap-6 text-sm font-medium text-meell-700 md:flex">
            <a href="#como-funciona" onClick={scrollTo('como-funciona')} className="transition hover:text-meell-500">Como funciona</a>
            <a href="#beneficios" onClick={scrollTo('beneficios')} className="transition hover:text-meell-500">Benefícios</a>
            <a href="#planos" onClick={scrollTo('planos')} className="transition hover:text-meell-500">Planos</a>
            <a href="#faq" onClick={scrollTo('faq')} className="transition hover:text-meell-500">FAQ</a>
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            <button onClick={() => navigate('/login')} className="btn-secondary">Entrar</button>
            <button onClick={() => navigate('/signup')} className="btn-primary">
              Começar agora <ArrowRight size={16} />
            </button>
          </div>
          <button
            className="rounded-xl p-2 text-meell-600 ring-1 ring-white/40 md:hidden"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Menu"
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {menuOpen && (
          <div className="border-t border-white/30 bg-white/80 px-5 py-4 backdrop-blur-xl md:hidden">
            <nav className="flex flex-col gap-3 text-sm font-medium text-meell-700">
              <a href="#como-funciona" onClick={(e) => { scrollTo('como-funciona')(e); setMenuOpen(false); }}>Como funciona</a>
              <a href="#beneficios" onClick={(e) => { scrollTo('beneficios')(e); setMenuOpen(false); }}>Benefícios</a>
              <a href="#planos" onClick={(e) => { scrollTo('planos')(e); setMenuOpen(false); }}>Planos</a>
              <a href="#faq" onClick={(e) => { scrollTo('faq')(e); setMenuOpen(false); }}>FAQ</a>
            </nav>
            <div className="mt-4 flex flex-col gap-2">
              <button onClick={() => navigate('/login')} className="btn-secondary">Entrar</button>
              <button onClick={() => navigate('/signup')} className="btn-primary">Começar agora</button>
            </div>
          </div>
        )}
      </header>

      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="relative overflow-hidden pb-8 pt-24">
        {/* Decorative floating blobs */}
        <div className="pointer-events-none absolute -left-32 top-0 h-[500px] w-[500px] rounded-full bg-gradient-primary opacity-20 blur-3xl" />
        <div className="pointer-events-none absolute -right-24 top-24 h-[420px] w-[420px] rounded-full bg-gradient-to-br from-lilas-300 to-indigo-300 opacity-20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/2 h-[300px] w-[300px] -translate-x-1/2 rounded-full bg-gradient-to-tr from-pink-200 to-lilac-200 opacity-15 blur-3xl" />

        <div className="relative mx-auto max-w-6xl px-5 py-16 sm:py-24">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div className="animate-fadeUp">
              <span className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-white/60 px-4 py-1.5 text-xs font-semibold text-lilas-600 ring-1 ring-white/40 backdrop-blur-sm">
                <Sparkles size={14} /> by Meell · ecossistema Agenda Creator Pro
              </span>
              <h1 className="text-4xl font-extrabold leading-tight sm:text-6xl">
                Proteja seus arquivos{' '}
                <span className="bg-gradient-primary bg-clip-text text-transparent">
                  digitais com inteligência
                </span>
              </h1>
              <p className="mt-5 text-lg text-meell-600 sm:text-xl">
                Proteja seus arquivos. Controle suas entregas. Saiba quem recebeu e quando baixou.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <button onClick={() => navigate('/signup')} className="btn-primary">
                  Começar agora <ArrowRight size={16} />
                </button>
                <a href="#planos" onClick={scrollTo('planos')} className="btn-secondary">Ver planos</a>
              </div>
              <div className="mt-8 flex items-center gap-6 text-xs text-meell-400">
                <div className="flex items-center gap-1.5"><Shield size={14} /> Proteção ativa</div>
                <div className="flex items-center gap-1.5"><Lock size={14} /> Entrega segura</div>
                <div className="flex items-center gap-1.5"><BarChart3 size={14} /> Rastreamento</div>
              </div>
            </div>

            {/* Floating file card */}
            <div className="relative animate-fadeUp">
              <div className="glass mx-auto max-w-md rounded-3xl p-6 shadow-card-hover transition duration-300 hover:-translate-y-1 animate-floaty">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-primary text-white">
                    <FileCheck2 size={24} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-meell-800">Agenda Candy 2027.pdf</div>
                    <div className="text-xs text-meell-400">ID: MP-2026-X7K92A</div>
                  </div>
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600">
                    <Lock size={12} /> Proteção ativa
                  </span>
                </div>
                <div className="mt-5 space-y-2 text-xs text-meell-600">
                  <Row label="Proprietário" value="Nome do criador" />
                  <Row label="Protegido em" value="19/07/2026 14:32" />
                  <Row label="Entregas" value="3 ativas" />
                  <Row label="Downloads" value="7" />
                </div>
                <div className="mt-4 rounded-2xl bg-lilas-50/80 p-3 ring-1 ring-lilas-100">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-lilas-500">Linha do tempo</div>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-meell-500">
                    <span>Enviado</span><span>Protegido</span><span>Autorizado</span><span>Acessado</span><span>Baixado</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-gradient-primary" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── How It Works ───────────────────────────────────── */}
      <section id="como-funciona" className="relative mx-auto max-w-6xl px-5 py-20">
        <div className="pointer-events-none absolute -right-20 top-0 h-64 w-64 rounded-full bg-gradient-to-br from-pink-200 to-lilac-200 opacity-15 blur-3xl" />
        <div className="text-center">
          <h2 className="section-title">Como funciona</h2>
          <p className="mx-auto mt-3 max-w-xl text-meell-600">
            Quatro passos simples para proteger, entregar, controlar e rastrear seus arquivos digitais.
          </p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <div key={s.title} className="glass group relative overflow-hidden rounded-3xl p-6 transition duration-300 hover:-translate-y-1 hover:shadow-card-hover">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-glow transition duration-300 group-hover:scale-110">
                <s.icon size={24} />
              </div>
              <div className="absolute right-4 top-4 text-5xl font-extrabold text-meell-100 transition group-hover:text-meell-200">
                {i + 1}
              </div>
              <div className="mt-5 text-xs font-bold uppercase tracking-wide text-lilas-400">Passo {i + 1}</div>
              <div className="mt-1 text-lg font-semibold text-meell-800">{s.title}</div>
              <p className="mt-2 text-sm leading-relaxed text-meell-600">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Stats ──────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-12">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="glass rounded-3xl p-6 text-center transition duration-300 hover:-translate-y-1 hover:shadow-card-hover">
              <div className="bg-gradient-primary bg-clip-text text-3xl font-extrabold text-transparent sm:text-4xl">{s.number}</div>
              <div className="mt-1 text-xs font-medium text-meell-400">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Benefits ───────────────────────────────────────── */}
      <section id="beneficios" className="relative py-20">
        <div className="pointer-events-none absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-gradient-to-br from-lilac-200 to-indigo-200 opacity-15 blur-3xl" />
        <div className="mx-auto max-w-6xl px-5">
          <div className="text-center">
            <h2 className="section-title">Por que usar o Meell Protect</h2>
            <p className="mx-auto mt-3 max-w-xl text-meell-600">
              Tudo que você precisa para vender arquivos digitais com segurança e profissionalismo.
            </p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {BENEFITS.map((b) => (
              <div key={b.title} className="glass group rounded-3xl p-6 transition duration-300 hover:-translate-y-1 hover:shadow-card-hover">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-glow transition duration-300 group-hover:scale-110">
                  <b.icon size={22} />
                </div>
                <div className="mt-4 text-base font-semibold text-meell-800">{b.title}</div>
                <p className="mt-2 text-sm leading-relaxed text-meell-600">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ───────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <div className="text-center">
          <h2 className="section-title">O que dizem nossos usuários</h2>
          <p className="mx-auto mt-3 max-w-xl text-meell-600">
            Quem já usa o Meell Protect recomenda.
          </p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {testimonials.map((t) => (
            <div key={t.name} className="glass group relative overflow-hidden rounded-3xl p-6 transition duration-300 hover:-translate-y-1 hover:shadow-card-hover">
              <div className="pointer-events-none absolute -right-4 -top-4 h-24 w-24 rounded-full bg-gradient-primary opacity-10 blur-2xl" />
              <Quote size={24} className="text-lilac-300" />
              <div className="mb-3 mt-2 flex gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} size={14} className="fill-amber-400 text-amber-400" />
                ))}
              </div>
              <p className="text-sm leading-relaxed text-meell-600">{t.text}</p>
              <div className="mt-5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-primary text-xs font-bold text-white shadow-glow">
                  {t.name.charAt(0)}
                </div>
                <div>
                  <div className="text-sm font-semibold text-meell-800">{t.name}</div>
                  <div className="text-xs text-meell-400">{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ────────────────────────────────────────── */}
      <section id="planos" className="relative mx-auto max-w-6xl px-5 py-20">
        <div className="pointer-events-none absolute -right-20 bottom-0 h-64 w-64 rounded-full bg-gradient-to-br from-pink-200 to-lilac-200 opacity-15 blur-3xl" />
        <div className="text-center">
          <h2 className="section-title">Planos e Preços</h2>
          <p className="mx-auto mt-3 max-w-xl text-meell-600">
            Assinatura mensal recorrente, estilo Netflix. Cancele quando quiser.
          </p>
        </div>
        <div className="mt-12 grid gap-6 lg:grid-cols-4">
          {plans.map((p) => (
            <div
              key={p.id}
              className={`relative flex flex-col rounded-3xl p-6 transition duration-300 ${
                p.popular
                  ? 'glass ring-2 ring-meell-400 shadow-card-hover lg:-translate-y-2'
                  : 'glass hover:-translate-y-1 hover:shadow-card-hover'
              }`}
            >
              {p.popular && (
                <span className="absolute -top-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-gradient-primary px-4 py-1 text-[11px] font-semibold text-white shadow-glow">
                  <Star size={12} /> Mais Popular
                </span>
              )}
              <div className="text-sm font-semibold text-meell-500">{p.name}</div>
              <div className="mt-2 text-3xl font-extrabold bg-gradient-primary bg-clip-text text-transparent">{p.price_label}</div>
              <div className="mt-1 text-xs text-meell-400">{p.tagline}</div>
              <ul className="mt-5 flex-1 space-y-2.5 text-sm text-meell-700">
                <Feature ok>{p.max_files === 5000 ? 'Arquivos ilimitados' : `${p.max_files} arquivos`}</Feature>
                <Feature ok>{p.max_storage_mb >= 200000 ? 'Armazenamento ilimitado' : `${p.max_storage_mb} MB de armazenamento`}</Feature>
                <Feature ok>{p.max_deliveries >= 20000 ? 'Entregas ilimitadas' : `${p.max_deliveries} entregas/mês`}</Feature>
                <Feature ok={p.watermark}>Marca d'água individual</Feature>
                <Feature ok={p.advanced_tracking}>Rastreamento avançado</Feature>
                <Feature ok={p.custom_branding}>Marca personalizada</Feature>
                <Feature ok={p.priority_support}>Suporte prioritário</Feature>
              </ul>
              <button
                onClick={() => {
                  if (p.checkout_url) window.open(p.checkout_url, '_blank', 'noopener');
                  else navigate('/signup');
                }}
                className={`mt-6 w-full ${p.popular ? 'btn-primary' : 'btn-secondary'}`}
              >
                {p.id === 'free' ? `Começar grátis` : `Assinar ${p.name}`}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────── */}
      <section id="faq" className="relative py-20">
        <div className="pointer-events-none absolute -left-20 top-1/4 h-64 w-64 rounded-full bg-gradient-to-br from-lilac-200 to-indigo-200 opacity-15 blur-3xl" />
        <div className="mx-auto max-w-3xl px-5">
          <div className="text-center">
            <h2 className="section-title">Perguntas frequentes</h2>
          </div>
          <div className="mt-10 space-y-3">
            {FAQ.map((item, i) => (
              <div key={i} className="glass rounded-3xl px-6 py-4 transition duration-300 hover:shadow-card">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="flex w-full items-center justify-between text-left"
                >
                  <span className="text-sm font-semibold text-meell-800">{item.q}</span>
                  <ChevronDown
                    size={18}
                    className={`ml-4 shrink-0 text-meell-400 transition duration-300 ${openFaq === i ? 'rotate-180 text-meell-600' : ''}`}
                  />
                </button>
                <div
                  className={`overflow-hidden transition-all duration-300 ${
                    openFaq === i ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'
                  }`}
                >
                  <p className="pt-3 text-sm leading-relaxed text-meell-600">{item.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer CTA ─────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-primary p-10 text-center text-white shadow-glow sm:p-16">
          <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <Zap size={28} className="relative mx-auto" />
          <h2 className="relative mt-4 text-2xl font-bold sm:text-3xl">Pronto para proteger o que você cria?</h2>
          <p className="relative mx-auto mt-3 max-w-md text-white/80">
            Comece grátis agora. Sem cartão de crédito.
          </p>
          <button
            onClick={() => navigate('/signup')}
            className="relative mt-6 inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-meell-600 shadow-lg transition duration-300 hover:scale-105 hover:shadow-xl"
          >
            Começar agora <ArrowRight size={16} />
          </button>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────── */}
      <footer className="border-t border-white/40 bg-white/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-10 sm:flex-row">
          <Logo />
          <div className="flex items-center gap-6 text-xs text-meell-400">
            <a href="#como-funciona" onClick={scrollTo('como-funciona')} className="transition hover:text-meell-500">Como funciona</a>
            <a href="#beneficios" onClick={scrollTo('beneficios')} className="transition hover:text-meell-500">Benefícios</a>
            <a href="#planos" onClick={scrollTo('planos')} className="transition hover:text-meell-500">Planos</a>
            <a href="#faq" onClick={scrollTo('faq')} className="transition hover:text-meell-500">FAQ</a>
          </div>
          <p className="text-xs text-meell-400">
            © {new Date().getFullYear()} Meell Protect · parte do ecossistema Meell · Agenda Creator Pro
          </p>
        </div>
      </footer>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-meell-400">{label}</span>
      <span className="font-medium text-meell-700">{value}</span>
    </div>
  );
}

function Feature({ children, ok }: { children: React.ReactNode; ok: boolean }) {
  return (
    <li className={`flex items-center gap-2 ${ok ? '' : 'text-meell-300'}`}>
      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${ok ? 'bg-gradient-primary text-white' : 'bg-meell-50 text-meell-300'}`}>
        {ok ? <Check size={12} /> : <X size={12} />}
      </span>
      {children}
    </li>
  );
}
