import { useEffect, useRef, useState, useCallback } from 'react';
import { MessageSquare, Send, X, Sparkles, Bot, Zap } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import type { ChatMessage, Plan } from '../lib/types';

const SUGGESTIONS = [
  'Como protejo um arquivo?',
  'Como crio uma entrega segura?',
  'O que aparece na Minha Biblioteca do cliente?',
  'Como funciona o rastreamento?',
  'Qual plano devo assinar?',
  'Quero assinar o Protect Business',
];

function useCheckoutUrls(): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    supabase.from('plans').select('id, checkout_url').then(({ data }) => {
      if (data) {
        const map: Record<string, string> = {};
        for (const p of data as Plan[]) {
          if (p.checkout_url) map[p.id] = p.checkout_url;
        }
        setUrls(map);
      }
    });
  }, []);
  return urls;
}

function botReply(question: string, urls: Record<string, string>): string {
  const q = question.toLowerCase();
  const bizUrl = urls.business || '#';
  const proUrl = urls.pro || '#';
  const startUrl = urls.start || '#';

  if (q.includes('business') || q.includes('99') || q.includes('caro') || q.includes('completo') || q.includes('melhor plano') || q.includes('quero assinar')) {
    return `Excelente escolha! O Protect Business (R$ 99/mês) é o plano mais completo do Meell Protect:\n\n- 5.000 arquivos protegidos\n- 200 GB de armazenamento\n- 20.000 entregas/mês\n- Rastreamento avançado\n- Marca personalizada\n- Suporte prioritário\n\nÉ a melhor opção para criadores que vendem em alto volume e querem todos os recursos premium sem preocupação com limites. Assine agora com segurança pelo link oficial:\n\n${bizUrl}`;
  }

  if (q.includes('prote') || q.includes('upload') || q.includes('arquivo')) {
    return `Proteger um arquivo no Meell Protect é simples e rápido:\n\n1. No painel, clique em "Proteger Arquivo".\n2. Envie seu PDF, planner, kit ou imagem.\n3. Dê um título (ex.: "Agenda Candy 2027").\n4. Ative a marca d'água se quiser (a partir do plano Start).\n5. Clique em "Proteger arquivo".\n\nPronto! O sistema gera um ID exclusivo Meell Protect no formato MP-AAAA-XXXXXX, registra proprietário, data, horário e status "Proteção ativa". Cada cópia entregue recebe uma identificação individual vinculada ao destinatário — assim você sempre sabe a origem de cada download.\n\nQuer proteger sem limites? Assine o Protect Business: ${bizUrl}`;
  }

  if (q.includes('entreg') || q.includes('cliente') || q.includes('link')) {
    return `A entrega segura é o coração do Meell Protect:\n\n1. Cadastre o cliente em "Meus Clientes" (nome + e-mail).\n2. Vá em "Entregas" e clique em "Nova entrega".\n3. Escolha o arquivo protegido e o cliente.\n4. Defina o limite de downloads e a expiração (em dias).\n5. O Meell Protect gera um link seguro com token único.\n\nO cliente recebe o link, entra ou cria a conta gratuita no site e baixa pela "Minha Biblioteca". O link nunca é público e permanente — você pode revogar a qualquer momento. Tudo rastreado, tudo sob seu controle.\n\nLibere entregas ilimitadas com o Protect Business: ${bizUrl}`;
  }

  if (q.includes('biblioteca')) {
    return `A "Minha Biblioteca" é a área gratuita do cliente final — o lugar onde ele acessa tudo que comprou de você e de outros criadores. Lá aparecem:\n\n- Capa e nome do produto\n- Criador/vendedor\n- Data de disponibilização\n- Status (Disponível, Expirado, Revogado, Limite atingido)\n- Botão "Baixar arquivo"\n\nAssim o cliente sempre precisa entrar no Meell Protect para baixar — nunca por link público. Isso significa mais segurança e mais recorrência: ele volta toda vez que compra algo novo.\n\nEntregue uma experiência premium aos seus clientes assinando o Protect Business: ${bizUrl}`;
  }

  if (q.includes('rastre') || q.includes('histórico') || q.includes('historico') || q.includes('linha do tempo')) {
    return `O rastreamento do Meell Protect registra cada etapa da entrega:\n\n- Quem protegeu o arquivo\n- Data e horário do envio\n- Para quem foi disponibilizado\n- Quando a entrega foi criada\n- Quando o cliente acessou (primeira visualização)\n- Data e horário de cada download\n- Quantidade de downloads\n- Última atividade\n\nA linha do tempo é: Arquivo enviado → Protegido → Cliente autorizado → Acessado → Baixado. Cada cópia entregue tem uma identificação única vinculada ao destinatário, ajudando a identificar a origem da cópia quando tecnicamente possível.\n\nO rastreamento avançado está disponível a partir do Protect Pro. Assine o Business e tenha o pacote completo: ${bizUrl}`;
  }

  if (q.includes('pro ') || q.includes('protect pro') || q.includes('69')) {
    return `O Protect Pro (R$ 69/mês) é o plano mais popular do Meell Protect:\n\n- 500 arquivos\n- 20 GB de armazenamento\n- 2.000 entregas/mês\n- Rastreamento avançado\n- Marca personalizada\n\nIdeal para criadores em crescimento. Assine agora: ${proUrl}`;
  }

  if (q.includes('start') || q.includes('29')) {
    return `O Protect Start (R$ 29/mês) é ideal para pequenos criadores:\n\n- 50 arquivos\n- 2 GB de armazenamento\n- 100 entregas/mês\n- Marca d'água individual\n\nComece agora: ${startUrl}`;
  }

  if (q.includes('plano') || q.includes('assinatura') || q.includes('preço') || q.includes('preco') || q.includes('quanto') || q.includes('devo') || q.includes('qual o melhor')) {
    return `Temos 4 planos (assinatura mensal, cancele quando quiser):\n\n• Grátis — R$ 0: teste com 3 arquivos.\n• Protect Start — R$ 29/mês: 50 arquivos, 2 GB, 100 entregas e marca d'água.\n• Protect Pro — R$ 69/mês: 500 arquivos, 20 GB, 2.000 entregas, rastreamento avançado e marca personalizada.\n• Protect Business — R$ 99/mês: 5.000 arquivos, 200 GB, 20.000 entregas, rastreamento avançado, marca personalizada e suporte prioritário.\n\nMinha recomendação é o Protect Business (R$ 99/mês) — é o plano mais completo, ideal para quem vende em volume e quer todos os recursos premium sem limites. Assine agora: ${bizUrl}`;
  }

  if (q.includes('cancel') || q.includes('reembol') || q.includes('trocar') || q.includes('mudar')) {
    return `Você pode trocar de plano a qualquer momento em "Plano e Assinatura". Para cancelar, basta voltar para o plano Grátis. A assinatura é mensal e sem fidelidade — você no controle sempre.\n\nQuer o plano mais completo? Assine o Protect Business: ${bizUrl}`;
  }

  if (q.includes('marca') || q.includes('watermark')) {
    return `A marca d'água identifica cada cópia entregue com um ID individual vinculado ao destinatário, ajudando a identificar a origem de uma cópia quando tecnicamente possível. Disponível a partir do plano Protect Start (R$ 29/mês).\n\nAssine o Protect Business e tenha marca d'água + marca personalizada: ${bizUrl}`;
  }

  return `Olá! Eu sou o Meell Chat, seu assistente do Meell Protect. Posso te ajudar com:\n\n- Proteção de arquivos\n- Entregas seguras\n- Minha Biblioteca do cliente\n- Rastreamento e histórico\n- Planos e assinatura\n\nMinha recomendação de plano? O Protect Business (R$ 99/mês) — o mais completo, com 5.000 arquivos, 200 GB e 20.000 entregas/mês. Assine agora: ${bizUrl}\n\nSobre o que você quer saber?`;
}

function renderContent(content: string, isUser: boolean) {
  const parts = content.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, i) => {
    if (/^https?:\/\//.test(part)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className={`underline break-all ${isUser ? 'text-white' : 'text-meell-600 hover:text-meell-700 font-semibold'}`}
        >
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

const GREETING_CONTENT_TEMPLATE =
  'Olá! Eu sou o Meell Chat, seu assistente do Meell Protect. Posso te ajudar com proteção de arquivos, entregas seguras, rastreamento e planos. Para começar, minha recomendação é o plano Protect Business (R$ 99/mês) — o mais completo. Assine: %BUSINESS_URL%\n\nO que você gostaria de saber?';

export default function MeellChat() {
  const { user } = useAuth();
  const checkoutUrls = useCheckoutUrls();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const bizUrl = checkoutUrls.business || '#';
  const greetingContent = GREETING_CONTENT_TEMPLATE.replace('%BUSINESS_URL%', bizUrl);

  // Initialize messages when chat opens the first time
  useEffect(() => {
    if (!open || initialized) return;
    setInitialized(true);
    if (!user) {
      setMessages([
        { id: 'intro', user_id: 'anon', role: 'assistant', content: greetingContent, created_at: new Date().toISOString() },
      ]);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(50);
      if (data && data.length) {
        setMessages(data as ChatMessage[]);
      } else {
        setMessages([
          { id: 'intro', user_id: user.id, role: 'assistant', content: greetingContent, created_at: new Date().toISOString() },
        ]);
      }
    })();
  }, [open, initialized, user, greetingContent]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;
      setInput('');
      setLoading(true);

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        user_id: user?.id ?? 'anon',
        role: 'user',
        content: trimmed,
        created_at: new Date().toISOString(),
      };
      setMessages((m) => [...m, userMsg]);

      if (user) {
        await supabase.from('chat_messages').insert({ user_id: user.id, role: 'user', content: trimmed });
      }

      await new Promise((r) => setTimeout(r, 500));
      const reply = botReply(trimmed, checkoutUrls);
      const botMsg: ChatMessage = {
        id: crypto.randomUUID(),
        user_id: user?.id ?? 'anon',
        role: 'assistant',
        content: reply,
        created_at: new Date().toISOString(),
      };
      setMessages((m) => [...m, botMsg]);

      if (user) {
        await supabase.from('chat_messages').insert({ user_id: user.id, role: 'assistant', content: reply });
      }

      setLoading(false);
    },
    [loading, user, checkoutUrls]
  );

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-gradient-to-r from-meell-500 to-lilas-500 px-4 py-3 text-white shadow-soft animate-pulseRing transition hover:scale-105 sm:bottom-5 sm:right-5"
        aria-label="Abrir Meell Chat"
      >
        {open ? <X size={20} /> : <MessageSquare size={20} />}
        <span className="hidden text-sm font-semibold sm:inline">Meell Chat</span>
      </button>

      {open && (
        <div className="fixed inset-x-0 bottom-0 z-50 flex h-[85vh] w-full animate-fadeUp flex-col overflow-hidden rounded-t-3xl shadow-soft ring-1 ring-meell-100 sm:inset-x-auto sm:bottom-24 sm:right-4 sm:h-[min(600px,72vh)] sm:w-[min(400px,calc(100vw-2rem))] sm:rounded-3xl">
          {/* Header */}
          <div className="flex items-center gap-3 bg-gradient-to-r from-meell-500 via-meell-500 to-lilas-500 px-4 py-3.5 text-white">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 ring-1 ring-white/30">
              <Bot size={22} />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-bold">Meell Chat</div>
              <div className="flex items-center gap-1 text-[11px] opacity-90">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> Assistente Meell Protect
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="ml-auto rounded-full p-1.5 transition hover:bg-white/20 sm:hidden"
              aria-label="Fechar"
            >
              <X size={20} />
            </button>
            <Sparkles size={16} className="hidden sm:block sm:ml-auto sm:opacity-80" />
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-lilas-50 via-meell-50/40 to-lilas-50 p-4"
          >
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {m.role === 'assistant' && (
                  <div className="mr-2 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-meell-500 to-lilas-500 text-white">
                    <Bot size={14} />
                  </div>
                )}
                <div
                  className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed sm:max-w-[85%] ${
                    m.role === 'user'
                      ? 'bg-gradient-to-r from-meell-500 to-lilas-500 text-white shadow-soft'
                      : 'bg-white text-meell-800 ring-1 ring-meell-100 shadow-card'
                  }`}
                >
                  {renderContent(m.content, m.role === 'user')}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="mr-2 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-meell-500 to-lilas-500 text-white">
                  <Bot size={14} />
                </div>
                <div className="rounded-2xl bg-white px-3.5 py-2.5 text-sm text-meell-400 ring-1 ring-meell-100">
                  <span className="inline-flex gap-1">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-meell-400" />
                    <span className="h-2 w-2 animate-pulse rounded-full bg-meell-400" style={{ animationDelay: '0.15s' }} />
                    <span className="h-2 w-2 animate-pulse rounded-full bg-meell-400" style={{ animationDelay: '0.3s' }} />
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Suggestions */}
          {messages.length <= 1 && (
            <div className="flex flex-wrap gap-2 bg-lilas-50/60 px-3 pb-2 pt-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  disabled={loading}
                  className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-lilas-700 shadow-card ring-1 ring-lilas-100 transition hover:bg-lilas-100 hover:scale-105 active:scale-95 disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* CTA Business */}
          <a
            href={bizUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mx-3 my-2 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-meell-500 to-lilas-500 px-4 py-2.5 text-xs font-bold text-white shadow-soft transition hover:scale-[1.02] active:scale-95"
          >
            <Zap size={14} /> Assinar Protect Business — R$ 99/mês
          </a>

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-center gap-2 border-t border-meell-50 bg-white p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pergunte ao Meell Chat..."
              className="flex-1 rounded-full bg-lilas-50 px-4 py-2.5 text-sm outline-none ring-1 ring-lilas-100 transition focus:ring-2 focus:ring-meell-300"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-meell-500 to-lilas-500 text-white shadow-soft transition hover:scale-105 active:scale-95 disabled:opacity-50"
              aria-label="Enviar"
            >
              <Send size={18} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
