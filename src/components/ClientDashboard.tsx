import { useEffect, useState, useCallback } from "react";
import {
  BookOpen,
  Download,
  Shield,
  Lock,
  Eye,
  Clock,
  LogOut,
  Menu,
  X,
  Sparkles,
  FileCheck2,
  AlertCircle,
  Share2,
} from "lucide-react";
import Logo from "./Logo";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { toast } from "./Toaster";
import { formatDate, timeAgo, fileEmoji, formatShortDate } from "../lib/utils";
import type { DeliveryWithRelations, DeliveryEvent } from "../lib/types";

export default function ClientDashboard({
  navigate,
}: {
  navigate: (to: string) => void;
}) {
  const { user, profile, signOut } = useAuth();
  const [deliveries, setDeliveries] = useState<DeliveryWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareDelivery, setShareDelivery] =
    useState<DeliveryWithRelations | null>(null);
  const [shareRecipientName, setShareRecipientName] = useState("");
  const [shareRecipientEmail, setShareRecipientEmail] = useState("");
  const [sharing, setSharing] = useState(false);
  const [shareResult, setShareResult] = useState<{
    new_token: string;
    recipient_name: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const rawHash = window.location.hash.replace(/^#/, "");
      const queryString = rawHash.includes("?")
        ? rawHash.substring(rawHash.indexOf("?") + 1)
        : "";

      const params = new URLSearchParams(queryString);
      const token = params.get("token");

      if (!token) {
        setDeliveries([]);
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/delivery-download?token=${encodeURIComponent(token)}`
      );

      const result = await response.json();

      if (!response.ok || !result.ok || !result.delivery) {
        throw new Error(
          result.error || "Não foi possível carregar esta entrega."
        );
      }

      setDeliveries([result.delivery as DeliveryWithRelations]);
    } catch (err) {
      console.error("PUBLIC DELIVERY LOAD ERROR:", err);

      toast(
        err instanceof Error
          ? err.message
          : "Não foi possível carregar esta entrega.",
        "error"
      );

      setDeliveries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDownload(d: DeliveryWithRelations) {
    const expired = d.expires_at && new Date(d.expires_at) < new Date();

    if (d.revoked) {
      toast("Esta entrega foi revogada.", "error");
      return;
    }

    if (expired) {
      toast("Esta entrega expirou.", "error");
      return;
    }

    if (d.download_count >= d.download_limit) {
      toast("Limite de downloads atingido.", "error");
      return;
    }

    setDownloading(d.id);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const fnUrl = `${supabaseUrl}/functions/v1/delivery-download`;

      // Download público autorizado pelo secure_token.
      // Não exige login/JWT.
      const fnRes = await fetch(fnUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: d.secure_token,
        }),
      });

      const fnData = await fnRes.json().catch(() => ({}));

      if (!fnRes.ok || !fnData.url) {
        throw new Error(
          fnData.error || "Não foi possível autorizar o download."
        );
      }

      // Abre a URL assinada gerada pelo servidor.
      const a = document.createElement("a");
      a.href = fnData.url;
      a.download =
        fnData.file_name ??
        d.file?.file_name ??
        "arquivo";

      a.target = "_blank";
      a.rel = "noopener";

      document.body.appendChild(a);
      a.click();
      a.remove();

      toast("Download autorizado!", "success");

      // Atualiza contador/status exibido no cartão.
      await load();
    } catch (err) {
      console.error("PUBLIC DOWNLOAD ERROR:", err);

      toast(
        err instanceof Error
          ? err.message
          : "Erro no download",
        "error"
      );
    } finally {
      setDownloading(null);
    }
  }

  async function handleShare(e: React.FormEvent) {
    e.preventDefault();
    if (!shareDelivery) return;
    setSharing(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;

      const res = await fetch(`${supabaseUrl}/functions/v1/share-protected`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: shareDelivery.secure_token,
          recipient_name: shareRecipientName.trim(),
          recipient_email: shareRecipientEmail.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok)
        throw new Error(data.error || "Erro ao compartilhar");
      setShareResult({
        new_token: data.new_token,
        recipient_name: data.recipient_name,
      });
      toast("Arquivo compartilhado com proteção!", "success");
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Erro ao compartilhar",
        "error",
      );
    } finally {
      setSharing(false);
    }
  }

  function closeShareModal() {
    setShareDelivery(null);
    setShareRecipientName("");
    setShareRecipientEmail("");
    setShareResult(null);
  }

  async function markViewed(d: DeliveryWithRelations) {
    if (!user || d.first_viewed_at) return;
    await supabase
      .from("deliveries")
      .update({ first_viewed_at: new Date().toISOString() })
      .eq("id", d.id);
    await supabase.from("delivery_events").insert({
      delivery_id: d.id,
      event_type: "viewed",
      actor_id: user.id,
    });
    load();
  }

  const visitorName = profile?.display_name || profile?.email || "Visitante";

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-meell-100 bg-white/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <Logo />
          <div className="flex items-center gap-2">
            <span className="pill bg-lilas-50 text-lilas-700">
              <BookOpen size={12} /> Minha Biblioteca
            </span>
            <button
              className="lg:hidden"
              onClick={() => setMenuOpen((o) => !o)}
            >
              {menuOpen ? (
                <X size={22} className="text-meell-600" />
              ) : (
                <Menu size={22} className="text-meell-600" />
              )}
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="border-t border-meell-100 bg-white px-5 py-3 lg:hidden">
            <button
              onClick={async () => {
                await signOut();
                navigate("/");
              }}
              className="flex w-full items-center gap-2 text-sm font-medium text-meell-600"
            >
              <LogOut size={16} /> Sair
            </button>
          </div>
        )}
      </header>

      <div className="mx-auto max-w-6xl px-5 py-6 lg:py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-meell-800">
            Minha Biblioteca
          </h1>
          <p className="text-sm text-meell-500">
            Olá, {visitorName}. Aqui está o arquivo protegido disponibilizado para você.
          </p>
        </div>

        {loading ? (
          <div className="py-20 text-center text-meell-400">
            Carregando sua biblioteca...
          </div>
        ) : deliveries.length === 0 ? (
          <div className="card py-16 text-center">
            <BookOpen size={36} className="mx-auto text-meell-300" />
            <h2 className="mt-3 text-lg font-semibold text-meell-700">
              Sua biblioteca está vazia
            </h2>
            <p className="mt-1 text-sm text-meell-400">
              Quando um criador enviar um arquivo protegido para você, ele
              aparecerá aqui.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {deliveries.map((d) => {
              const expired =
                d.expires_at && new Date(d.expires_at) < new Date();
              const exhausted = d.download_count >= d.download_limit;
              const blocked = d.revoked || expired || exhausted;
              return (
                <div
                  key={d.id}
                  className="card group"
                  onMouseEnter={() => !blocked && markViewed(d)}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-meell-100 to-lilas-100 text-3xl">
                      {fileEmoji(d.file?.mime_type ?? "")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-meell-800">
                        {d.file?.title}
                      </div>
                      <div className="truncate text-xs text-meell-400">
                        {d.file?.meell_id}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1 text-xs text-meell-500">
                    <div className="flex items-center justify-between">
                      <span className="text-meell-400">Criador</span>
                      <span className="font-medium text-meell-700">
                        via Meell Protect
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-meell-400">Disponibilizado em</span>
                      <span>{formatShortDate(d.created_at)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-meell-400">Downloads</span>
                      <span>
                        {d.download_count}/{d.download_limit}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3">
                    {d.revoked ? (
                      <span className="pill bg-rose-50 text-rose-600">
                        <Lock size={11} /> Revogado
                      </span>
                    ) : expired ? (
                      <span className="pill bg-amber-50 text-amber-600">
                        <Clock size={11} /> Expirado
                      </span>
                    ) : exhausted ? (
                      <span className="pill bg-amber-50 text-amber-600">
                        <AlertCircle size={11} /> Limite atingido
                      </span>
                    ) : (
                      <span className="pill bg-emerald-50 text-emerald-600">
                        <Shield size={11} /> Disponível
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => handleDownload(d)}
                    disabled={blocked || downloading === d.id}
                    className="btn-primary mt-4 w-full"
                  >
                    {downloading === d.id ? (
                      "Baixando..."
                    ) : (
                      <>
                        <Download size={16} /> Baixar arquivo
                      </>
                    )}
                  </button>
                  {!blocked && (
                    <button
                      onClick={() => {
                        setShareDelivery(d);
                        setShareResult(null);
                      }}
                      className="btn-soft mt-2 w-full"
                    >
                      <Share2 size={14} /> Compartilhar com proteção
                    </button>
                  )}
                  {d.last_downloaded_at && (
                    <div className="mt-2 text-center text-[11px] text-meell-300">
                      Último download {timeAgo(d.last_downloaded_at)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-10 card flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-meell-500 to-lilas-500 text-white">
            <Sparkles size={22} />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-meell-800">
              Por que preciso entrar no site para baixar?
            </div>
            <div className="text-xs text-meell-500">
              O Meell Protect garante que só você, cliente autorizado e
              autenticado, consiga baixar os arquivos. Seu criador pode rastrear
              quando você acessou e baixou cada entrega.
            </div>
          </div>
        </div>

        <div className="mt-6 hidden text-right lg:block">
          <button
            onClick={async () => {
              await signOut();
              navigate("/");
            }}
            className="btn-ghost text-rose-600"
          >
            <LogOut size={14} /> Sair
          </button>
        </div>
      </div>

      {/* Share modal */}
      {shareDelivery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
          <div className="card w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-meell-500 to-lilas-500 text-white">
                  <Share2 size={16} />
                </div>
                <div>
                  <div className="text-sm font-semibold text-meell-800">
                    Compartilhar com proteção
                  </div>
                  <div className="text-xs text-meell-400 truncate max-w-[200px]">
                    {shareDelivery.file?.title}
                  </div>
                </div>
              </div>
              <button
                onClick={closeShareModal}
                className="text-meell-400 hover:text-meell-600"
              >
                <X size={18} />
              </button>
            </div>

            {shareResult ? (
              <div className="space-y-3">
                <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">
                  <div className="font-semibold mb-1">
                    ✅ Compartilhamento gerado!
                  </div>
                  <div className="text-xs text-emerald-700">
                    <strong>{shareResult.recipient_name}</strong> recebeu uma
                    cópia protegida com fingerprint único vinculado à sua
                    entrega.
                  </div>
                </div>
                <div className="rounded-2xl bg-meell-50 p-3 text-xs text-meell-600">
                  <div className="font-semibold text-meell-700 mb-1">
                    Token de acesso
                  </div>
                  <div className="font-mono break-all text-meell-500">
                    {shareResult.new_token}
                  </div>
                </div>
                <div className="rounded-2xl bg-amber-50 p-3 text-xs text-amber-700">
                  <Shield size={12} className="inline mr-1" />O destinatário
                  precisa ter uma conta Meell Protect para acessar o arquivo com
                  este token.
                </div>
                <button className="btn-soft w-full" onClick={closeShareModal}>
                  Fechar
                </button>
              </div>
            ) : (
              <form onSubmit={handleShare} className="space-y-3">
                <p className="text-xs text-meell-500">
                  O destinatário receberá uma cópia do arquivo com um{" "}
                  <strong>fingerprint exclusivo</strong> vinculado à sua
                  entrega. Qualquer compartilhamento não autorizado poderá ser
                  rastreado até esta cadeia.
                </p>
                <div>
                  <label className="text-xs font-semibold text-meell-600">
                    Nome do destinatário
                  </label>
                  <input
                    type="text"
                    required
                    value={shareRecipientName}
                    onChange={(e) => setShareRecipientName(e.target.value)}
                    placeholder="Ex: João Silva"
                    className="input mt-1 w-full"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-meell-600">
                    E-mail do destinatário
                  </label>
                  <input
                    type="email"
                    required
                    value={shareRecipientEmail}
                    onChange={(e) => setShareRecipientEmail(e.target.value)}
                    placeholder="joao@email.com"
                    className="input mt-1 w-full"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={closeShareModal}
                    className="btn-ghost flex-1"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={sharing}
                    className="btn-primary flex-1"
                  >
                    {sharing ? (
                      "Gerando..."
                    ) : (
                      <>
                        <Share2 size={14} /> Compartilhar
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
