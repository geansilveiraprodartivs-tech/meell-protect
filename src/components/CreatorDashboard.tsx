import { useEffect, useState, useCallback, useRef } from 'react';
import {
  LayoutDashboard, ShieldPlus, Files, Users, Send, History, CreditCard,
  User as UserIcon, Settings, Menu, X, LogOut, Shield, Plus, Download,
  Eye, Lock, RefreshCw, Trash2, Copy, Check, AlertCircle, Search, FileCheck2,
  Sparkles, TrendingUp, HardDrive, Package, ShieldCheck, Share2, FileX,
  UserX, Moon, Sun,
} from 'lucide-react';
import Logo from './Logo';
import Modal from './Modal';
import { useAuth } from '../lib/auth';
import { supabase, STORAGE_BUCKET } from '../lib/supabase';
import { toast } from './Toaster';
import VerifyFile from './VerifyFile';
import { SkeletonCard } from './Skeleton';
import {
  genMeellId, genToken, genFingerprint, formatBytes, formatDate, timeAgo, fileEmoji,
} from '../lib/utils';
import type {
  Plan, ProtectedFile, ClientRow, Delivery, DeliveryEvent, ActivityLog,
  DeliveryWithRelations,
} from '../lib/types';

type View =
  | 'dashboard' | 'protect' | 'files' | 'clients' | 'deliveries'
  | 'tracking' | 'plan' | 'profile' | 'settings' | 'verify';

const NAV: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'protect', label: 'Proteger Arquivo', icon: ShieldPlus },
  { id: 'files', label: 'Meus Arquivos', icon: Files },
  { id: 'clients', label: 'Meus Clientes', icon: Users },
  { id: 'deliveries', label: 'Entregas', icon: Send },
  { id: 'tracking', label: 'Rastreamento', icon: History },
  { id: 'verify', label: 'Verificar Arquivo', icon: ShieldCheck },
  { id: 'plan', label: 'Plano e Assinatura', icon: CreditCard },
  { id: 'profile', label: 'Perfil', icon: UserIcon },
  { id: 'settings', label: 'Configurações', icon: Settings },
];

export default function CreatorDashboard({ navigate }: { navigate: (to: string) => void }) {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const [view, setView] = useState<View>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [files, setFiles] = useState<ProtectedFile[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryWithRelations[]>([]);
  const [events, setEvents] = useState<DeliveryEvent[]>([]);
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    if (!user) return;
    const [p, f, c, d, a] = await Promise.all([
      supabase.from('plans').select('*').eq('id', profile?.plan_id ?? 'free').maybeSingle(),
      supabase.from('protected_files').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('clients').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase
        .from('deliveries')
        .select('*, file:protected_files(*), client:clients(*)')
        .order('created_at', { ascending: false }) as any,
      supabase.from('activity_log').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
    ]);
    setPlan((p.data as Plan) ?? null);
    setFiles((f.data as ProtectedFile[]) ?? []);
    setClients((c.data as ClientRow[]) ?? []);
    setDeliveries((d.data as DeliveryWithRelations[]) ?? []);
    setActivity((a.data as ActivityLog[]) ?? []);
    setLoading(false);
  }, [user, profile]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const logActivity = useCallback(async (event: string, description?: string) => {
    if (!user) return;
    await supabase.from('activity_log').insert({ user_id: user.id, event, description });
  }, [user]);

  if (!profile) return null;

  const isCreator = profile.account_type === 'creator';

  return (
    <div className="flex min-h-screen bg-gradient-hero">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 transform bg-gradient-sidebar backdrop-blur-xl border-r border-pink-100/50 dark:border-pink-900/20 transition-transform lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-pink-100/30">
            <Logo size={32} />
            <button className="lg:hidden" onClick={() => setSidebarOpen(false)}>
              <X size={20} className="text-pink-300 hover:text-pink-500 transition" />
            </button>
          </div>
          <div className="px-5 py-3">
            <div className="glass rounded-2xl p-3 shadow-card">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-pink-400">Plano atual</div>
              <div className="mt-0.5 flex items-center gap-2 text-sm font-bold text-meell-700 dark:text-slate-200">
                <Sparkles size={14} className="text-pink-500" /> {plan?.name ?? 'Grátis'}
              </div>
            </div>
          </div>
          <nav className="flex-1 space-y-1 px-3">
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  setView(n.id);
                  setSidebarOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition ${
                  view === n.id
                    ? 'sidebar-link-active'
                    : 'sidebar-link'
                }`}
              >
                <n.icon size={18} />
                {n.label}
              </button>
            ))}
          </nav>
          <div className="border-t border-pink-100/30 p-3">
            <button
              onClick={async () => {
                await signOut();
                navigate('/');
              }}
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-pink-400 hover:bg-pink-50/50 dark:hover:bg-pink-900/20 transition"
            >
              <LogOut size={18} /> Sair
            </button>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main */}
      <main className="flex-1 lg:pl-0">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-pink-100 dark:border-pink-900/30 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl px-5 py-3 lg:px-8">
          <div className="flex items-center gap-3">
            <button className="lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu size={22} className="text-meell-600 dark:text-slate-300" />
            </button>
            <div>
              <div className="text-xs text-pink-400">Olá,</div>
              <div className="text-sm font-semibold text-meell-800 dark:text-slate-100">
                {profile.display_name || profile.email}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="pill bg-gradient-primary/10 text-pink-600 dark:text-pink-400">
              <Shield size={12} /> {isCreator ? 'Criador' : 'Cliente'}
            </span>
          </div>
        </header>

        <div className="px-5 py-6 lg:px-8">
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : (
            <>
              {view === 'dashboard' && (
                <DashboardView files={files} clients={clients} deliveries={deliveries} activity={activity} plan={plan} setView={setView} />
              )}
              {view === 'protect' && (
                <ProtectView onDone={() => { loadAll(); setView('files'); }} logActivity={logActivity} plan={plan} files={files} />
              )}
              {view === 'files' && (
                <FilesView files={files} plan={plan} onChange={loadAll} logActivity={logActivity} />
              )}
              {view === 'clients' && (
                <ClientsView clients={clients} deliveries={deliveries} onChange={loadAll} logActivity={logActivity} />
              )}
              {view === 'deliveries' && (
                <DeliveriesView files={files} clients={clients} deliveries={deliveries} onChange={loadAll} logActivity={logActivity} />
              )}
              {view === 'tracking' && (
                <TrackingView deliveries={deliveries} />
              )}
              {view === 'verify' && <VerifyFile />}
              {view === 'plan' && (
                <PlanView profile={profile} onChange={async () => { await refreshProfile(); await loadAll(); }} logActivity={logActivity} />
              )}
              {view === 'profile' && <ProfileView />}
              {view === 'settings' && <SettingsView />}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

/* ---------------- Dashboard ---------------- */
function DashboardView({
  files, clients, deliveries, activity, plan, setView,
}: {
  files: ProtectedFile[];
  clients: ClientRow[];
  deliveries: DeliveryWithRelations[];
  activity: ActivityLog[];
  plan: Plan | null;
  setView: (v: View) => void;
}) {
  const totalDownloads = deliveries.reduce((s, d) => s + (d.download_count || 0), 0);
  const storageUsed = files.reduce((s, f) => s + (f.file_size || 0), 0);
  const storageMB = storageUsed / (1024 * 1024);
  const stats = [
    { label: 'Arquivos protegidos', value: files.length, icon: FileCheck2, color: 'from-pink-500 to-pink-400' },
    { label: 'Clientes', value: clients.length, icon: Users, color: 'from-violet-500 to-violet-400' },
    { label: 'Entregas', value: deliveries.length, icon: Send, color: 'from-pink-400 to-violet-400' },
    { label: 'Downloads', value: totalDownloads, icon: Download, color: 'from-violet-400 to-pink-500' },
  ];
  const limits = [
    { label: 'Arquivos', used: files.length, max: plan?.max_files ?? 5 },
    { label: 'Armazenamento (MB)', used: Math.round(storageMB), max: plan?.max_storage_mb ?? 50 },
    { label: 'Entregas/mês', used: deliveries.length, max: plan?.max_deliveries ?? 10 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="section-title">Dashboard</h1>
        <p className="text-sm text-meell-500 dark:text-slate-400">Visão geral do seu Meell Protect.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card">
            <div className={`flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br ${s.color} text-white shadow-glow`}>
              <s.icon size={20} />
            </div>
            <div className="mt-3 text-2xl font-bold text-meell-800">{s.value}</div>
            <div className="text-xs text-pink-400">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-meell-800">Uso do plano</h2>
            <button onClick={() => setView('plan')} className="text-xs font-semibold text-pink-500 hover:text-pink-600 transition">
              Ver planos
            </button>
          </div>
          <div className="mt-4 space-y-4">
            {limits.map((l) => {
              const pct = Math.min(100, (l.used / l.max) * 100);
              return (
                <div key={l.label}>
                  <div className="flex justify-between text-xs text-meell-500">
                    <span>{l.label}</span>
                    <span>{l.used} / {l.max}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-pink-50 dark:bg-pink-900/20">
                    <div
                      className="h-full rounded-full bg-gradient-primary"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <h2 className="font-semibold text-meell-800">Atividades recentes</h2>
          <div className="mt-3 space-y-3">
            {activity.length === 0 && <p className="text-xs text-pink-400">Nenhuma atividade ainda.</p>}
            {activity.slice(0, 6).map((a) => (
              <div key={a.id} className="flex items-start gap-2 text-xs">
                <div className="mt-1 h-2 w-2 rounded-full bg-pink-400" />
                <div>
                  <div className="font-medium text-meell-700">{a.event}</div>
                  {a.description && <div className="text-pink-400">{a.description}</div>}
                  <div className="text-pink-300">{timeAgo(a.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-meell-800">Entregas recentes</h2>
          <button onClick={() => setView('deliveries')} className="text-xs font-semibold text-pink-500 hover:text-pink-600 transition">
            Ver todas
          </button>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-pink-400">
              <tr>
                <th className="py-2">Arquivo</th>
                <th className="py-2">Cliente</th>
                <th className="py-2">Downloads</th>
                <th className="py-2">Status</th>
                <th className="py-2">Criada</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.slice(0, 5).map((d) => (
                <tr key={d.id} className="border-t border-pink-50 dark:border-pink-900/20 hover:bg-pink-50/30 dark:hover:bg-pink-900/10 transition">
                  <td className="py-2.5">{d.file?.title ?? '—'}</td>
                  <td className="py-2.5">{d.client?.name ?? '—'}</td>
                  <td className="py-2.5">{d.download_count}/{d.download_limit}</td>
                  <td className="py-2.5">
                    {d.revoked ? (
                      <span className="pill badge-danger">Revogada</span>
                    ) : d.expires_at && new Date(d.expires_at) < new Date() ? (
                      <span className="pill badge-warning">Expirada</span>
                    ) : (
                      <span className="pill badge-success">Ativa</span>
                    )}
                  </td>
                  <td className="py-2.5 text-pink-400">{timeAgo(d.created_at)}</td>
                </tr>
              ))}
              {deliveries.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-pink-400">Nenhuma entrega ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Protect ---------------- */
type UploadMode = 'single' | 'multiple' | 'folder';

function ProtectView({ onDone, logActivity, plan, files }: { onDone: () => void; logActivity: (e: string, d?: string) => void; plan: Plan | null; files: ProtectedFile[] }) {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [uploadMode, setUploadMode] = useState<UploadMode>('single');
  const [fileList, setFileList] = useState<File[]>([]);
  const [watermark, setWatermark] = useState(false);
  const [watermarkText, setWatermarkText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute('webkitdirectory', '');
      folderInputRef.current.setAttribute('directory', '');
    }
  }, []);

  function handleFiles(files: FileList | null) {
    if (!files) return;
    setFileList(Array.from(files));
  }

  async function protectSingleFile(file: File, fileTitle: string): Promise<void> {
    if (!user) return;
    const meellId = genMeellId();
    const fingerprint = genFingerprint();
    // Preserve folder structure using webkitRelativePath when available
    const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    const safePath = relativePath
      .split('/')
      .map((part) => part.replace(/[^a-zA-Z0-9.\-_]/g, '_'))
      .join('/');
    const safeName = `${user.id}/${meellId}-${safePath}`;
    const { error: upErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(safeName, file, { cacheControl: '3600', upsert: false });
    if (upErr) throw upErr;
    const { error: dbErr } = await supabase.from('protected_files').insert({
      user_id: user.id,
      meell_id: meellId,
      title: fileTitle,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type || 'application/octet-stream',
      storage_path: safeName,
      watermark: plan?.watermark ? watermark : false,
      watermark_text: plan?.watermark ? watermarkText : null,
      copy_fingerprint: fingerprint,
      status: 'protected',
    });
    if (dbErr) throw dbErr;
    await logActivity('file_protected', `Arquivo "${fileTitle}" protegido com ID ${meellId}`);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || fileList.length === 0) return;

    // Plan limit enforcement
    if (plan) {
      const currentFileCount = files.length;
      const newTotal = currentFileCount + fileList.length;
      if (newTotal > plan.max_files) {
        toast(
          `Limite do plano atingido: ${plan.max_files} arquivos (você já tem ${currentFileCount}).`,
          'error'
        );
        return;
      }
      const uploadSizeMB = fileList.reduce((s, f) => s + f.size, 0) / (1024 * 1024);
      const currentStorageMB = files.reduce((s, f) => s + (f.file_size || 0), 0) / (1024 * 1024);
      if (currentStorageMB + uploadSizeMB > plan.max_storage_mb) {
        toast(
          `Limite de armazenamento atingido: ${plan.max_storage_mb} MB (você já usa ${Math.round(currentStorageMB)} MB).`,
          'error'
        );
        return;
      }
    }

    setUploading(true);
    let errors = 0;
    try {
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const pct = Math.round(((i) / fileList.length) * 100);
        setProgress(pct);
        setProgressLabel(
          fileList.length === 1
            ? `Enviando ${file.name}...`
            : `Arquivo ${i + 1} de ${fileList.length}: ${file.name}`
        );
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
        const fileTitle =
          uploadMode === 'single'
            ? (title || file.name)
            : relativePath
            ? relativePath.split('/').slice(1).join('/') || file.name
            : file.name;
        try {
          await protectSingleFile(file, fileTitle);
        } catch (err) {
          errors++;
          const msg = err instanceof Error ? err.message : 'Erro ao proteger';
          toast(`${file.name}: ${msg}`, 'error');
        }
      }
      setProgress(100);
      if (errors === 0) {
        toast(
          fileList.length === 1
            ? 'Arquivo protegido com sucesso!'
            : `${fileList.length} arquivos protegidos com sucesso!`,
          'success'
        );
      } else if (errors < fileList.length) {
        toast(`${fileList.length - errors} de ${fileList.length} arquivos protegidos.`, 'success');
      }
      if (errors < fileList.length) onDone();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao proteger';
      toast(msg, 'error');
    } finally {
      setUploading(false);
      setProgress(0);
      setProgressLabel('');
    }
  }

  const MODES: { id: UploadMode; label: string }[] = [
    { id: 'single', label: 'Arquivo único' },
    { id: 'multiple', label: 'Múltiplos arquivos' },
    { id: 'folder', label: 'Pasta inteira' },
  ];

  const totalSize = fileList.reduce((s, f) => s + f.size, 0);

  return (
    <div className="max-w-2xl">
      <h1 className="section-title">Proteger novo arquivo</h1>
      <p className="text-sm text-meell-500">Gere um ID exclusivo Meell Protect e registre seu arquivo.</p>

      <form onSubmit={submit} className="mt-6 space-y-4 card">
        {/* Mode selector */}
        <div>
          <div className="label">Modo de upload</div>
          <div className="flex gap-2">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => { setUploadMode(m.id); setFileList([]); }}
                className={`flex-1 rounded-2xl px-3 py-2 text-xs font-medium ring-1 transition ${
                  uploadMode === m.id
                    ? 'bg-gradient-primary text-white ring-pink-500 shadow-glow'
                    : 'bg-white dark:bg-slate-800 text-meell-600 ring-pink-100 dark:ring-pink-900/30 hover:bg-pink-50 dark:hover:bg-pink-900/20'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* File / folder input */}
        <div>
          <label className="label">
            {uploadMode === 'single' ? 'Arquivo (PDF, imagem, zip...)' : uploadMode === 'multiple' ? 'Arquivos' : 'Pasta'}
          </label>
          {uploadMode === 'folder' ? (
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-pink-200 dark:border-pink-800 bg-pink-50/30 dark:bg-pink-900/10 px-4 py-8 text-center transition hover:border-pink-400 hover:bg-pink-50/50">
              <ShieldPlus size={28} className="text-pink-400" />
              <div className="text-sm font-medium text-meell-700">
                {fileList.length > 0
                  ? `${fileList.length} arquivo(s) selecionado(s) · ${formatBytes(totalSize)}`
                  : 'Clique para escolher uma pasta'}
              </div>
              <div className="text-xs text-pink-400">A estrutura de subpastas será preservada</div>
              <input
                ref={folderInputRef}
                type="file"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </label>
          ) : (
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-pink-200 dark:border-pink-800 bg-pink-50/30 dark:bg-pink-900/10 px-4 py-8 text-center transition hover:border-pink-400 hover:bg-pink-50/50">
              <ShieldPlus size={28} className="text-pink-400" />
              <div className="text-sm font-medium text-meell-700">
                {fileList.length > 0
                  ? uploadMode === 'single'
                    ? fileList[0].name
                    : `${fileList.length} arquivo(s) selecionado(s) · ${formatBytes(totalSize)}`
                  : uploadMode === 'single'
                  ? 'Clique para escolher ou arraste o arquivo'
                  : 'Clique para escolher vários arquivos'}
              </div>
              {fileList.length === 1 && <div className="text-xs text-meell-400">{formatBytes(fileList[0].size)}</div>}
              <input
                type="file"
                className="hidden"
                multiple={uploadMode === 'multiple'}
                onChange={(e) => handleFiles(e.target.files)}
                required
              />
            </label>
          )}

          {/* File list preview for multiple/folder */}
          {fileList.length > 1 && (
            <div className="mt-2 max-h-32 overflow-y-auto rounded-2xl bg-pink-50/50 dark:bg-pink-900/15 p-2">
              {fileList.slice(0, 20).map((f, i) => {
                const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
                return (
                  <div key={i} className="flex items-center justify-between py-0.5 text-xs text-meell-600">
                    <span className="truncate">{rel}</span>
                    <span className="ml-2 shrink-0 text-pink-400">{formatBytes(f.size)}</span>
                  </div>
                );
              })}
              {fileList.length > 20 && (
                <div className="py-0.5 text-xs text-pink-400">... e mais {fileList.length - 20} arquivo(s)</div>
              )}
            </div>
          )}
        </div>

        {/* Title (single mode only) */}
        {uploadMode === 'single' && (
          <div>
            <label className="label">Título do produto</label>
            <input className="input" placeholder="Ex.: Agenda Candy 2027" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
        )}

        {plan?.watermark && (
          <div className="rounded-2xl bg-violet-50 dark:bg-violet-900/20 p-4 ring-1 ring-violet-100 dark:ring-violet-800">
            <label className="flex items-center gap-2 text-sm font-medium text-violet-700 dark:text-violet-300">
              <input type="checkbox" checked={watermark} onChange={(e) => setWatermark(e.target.checked)} className="rounded accent-violet-500" />
              Aplicar marca d'água
            </label>
            {watermark && (
              <input className="input mt-3" placeholder="Texto da marca d'água (ex: nome do cliente)" value={watermarkText} onChange={(e) => setWatermarkText(e.target.value)} />
            )}
          </div>
        )}

        {uploading && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-meell-500">
              <span>{progressLabel || 'Enviando e protegendo...'}</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-pink-100 dark:bg-pink-900/30">
              <div
                className="h-full rounded-full bg-gradient-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        <button type="submit" disabled={uploading || fileList.length === 0} className="btn-primary w-full">
          {uploading ? 'Protegendo...' : (<><ShieldPlus size={16} /> {fileList.length > 1 ? `Proteger ${fileList.length} arquivos` : 'Proteger arquivo'}</>)}
        </button>
      </form>
    </div>
  );
}

/* ---------------- Files ---------------- */
function FilesView({ files, plan, onChange, logActivity }: {
  files: ProtectedFile[];
  plan: Plan | null;
  onChange: () => void;
  logActivity: (e: string, d?: string) => void;
}) {
  const [confirm, setConfirm] = useState<ProtectedFile | null>(null);
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadingProtected, setDownloadingProtected] = useState<string | null>(null);

  async function downloadIdentical(f: ProtectedFile) {
    setDownloading(f.id);
    try {
      const { data, error } = await supabase
        .storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(f.storage_path, 60);
      if (error || !data?.signedUrl) {
        toast('Não foi possível gerar o link de download.', 'error');
        return;
      }
      const res = await fetch(data.signedUrl);
      if (!res.ok) {
        toast('Arquivo não encontrado ou sem permissão.', 'error');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = f.file_name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast('Falha temporária ao baixar o arquivo.', 'error');
    } finally {
      setDownloading(null);
    }
  }

  async function downloadProtected(f: ProtectedFile) {
    setDownloadingProtected(f.id);
    try {
      const { data, error } = await supabase.functions.invoke('creator-download', {
        body: { fileId: f.id, mode: 'protected' },
      });
      if (error || !data?.ok) {
        throw new Error(data?.error || error?.message || 'Erro ao gerar versão protegida');
      }
      const { url, file_name } = data as { url: string; file_name: string };
      const res = await fetch(url);
      if (!res.ok) throw new Error('Falha ao baixar versão protegida.');
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = file_name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Falha ao baixar versão protegida.', 'error');
    } finally {
      setDownloadingProtected(null);
    }
  }

  async function revoke(f: ProtectedFile) {
    await supabase.from('protected_files').update({ status: 'revoked' }).eq('id', f.id);
    await logActivity('file_revoked', `Arquivo "${f.title}" revogado`);
    toast('Arquivo revogado.', 'success');
    setConfirm(null);
    onChange();
  }

  async function remove(f: ProtectedFile) {
    await supabase.storage.from(STORAGE_BUCKET).remove([f.storage_path]);
    await supabase.from('protected_files').delete().eq('id', f.id);
    await logActivity('file_deleted', `Arquivo "${f.title}" excluído`);
    toast('Arquivo excluído.', 'success');
    setConfirm(null);
    onChange();
  }

  const filtered = files.filter((f) =>
    f.title.toLowerCase().includes(search.toLowerCase()) || f.meell_id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="section-title">Meus arquivos</h1>
          <p className="text-sm text-meell-500">{files.length} arquivo(s) protegido(s) · {plan?.name}</p>
        </div>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-pink-300" />
          <input className="input pl-9" placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((f) => (
          <div key={f.id} className="card">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-primary/10 text-2xl">
                {fileEmoji(f.mime_type)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-meell-800">{f.title}</div>
                <div className="text-xs text-pink-400">{f.meell_id}</div>
              </div>
              {f.status === 'protected' ? (
                <span className="pill badge-success"><Lock size={11} /> Ativa</span>
              ) : (
                <span className="pill badge-danger"><AlertCircle size={11} /> Revogado</span>
              )}
            </div>
            <div className="mt-3 space-y-1 text-xs text-meell-500">
              <div className="flex justify-between"><span>Tamanho</span><span>{formatBytes(f.file_size)}</span></div>
              <div className="flex justify-between"><span>Downloads</span><span>{f.downloads_count}</span></div>
              <div className="flex justify-between"><span>Protegido em</span><span>{formatDate(f.created_at)}</span></div>
              {f.watermark && <div className="flex justify-between"><span>Marca d'água</span><span className="text-violet-600 dark:text-violet-400">{f.watermark_text || 'Ativa'}</span></div>}
            </div>
            <div className="mt-4 space-y-2">
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(f.meell_id);
                    setCopied(f.id);
                    setTimeout(() => setCopied(null), 1500);
                  }}
                  className="btn-ghost flex-1"
                >
                  {copied === f.id ? <Check size={14} /> : <Copy size={14} />} ID
                </button>
                <button onClick={() => setConfirm(f)} className="rounded-2xl bg-rose-50 dark:bg-rose-900/30 p-2 text-rose-500 ring-1 ring-rose-100 dark:ring-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition">
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => downloadIdentical(f)}
                  disabled={downloading === f.id}
                  title="Baixar cópia idêntica (arquivo original, sem proteção)"
                  className="flex flex-1 items-center justify-center gap-1 rounded-2xl bg-pink-50 dark:bg-pink-900/20 py-2 text-xs font-medium text-pink-600 dark:text-pink-400 ring-1 ring-pink-100 dark:ring-pink-800 hover:bg-pink-100 dark:hover:bg-pink-900/30 disabled:opacity-50 transition"
                >
                  {downloading === f.id ? <RefreshCw size={13} className="animate-spin" /> : <Download size={13} />}
                  Cópia Idêntica
                </button>
                <button
                  onClick={() => downloadProtected(f)}
                  disabled={downloadingProtected === f.id}
                  title="Baixar versão protegida (fingerprint + marca d'água)"
                  className="flex flex-1 items-center justify-center gap-1 rounded-2xl bg-violet-50 dark:bg-violet-900/20 py-2 text-xs font-medium text-violet-700 dark:text-violet-400 ring-1 ring-violet-100 dark:ring-violet-800 hover:bg-violet-100 dark:hover:bg-violet-900/30 disabled:opacity-50 transition"
                >
                  {downloadingProtected === f.id ? <RefreshCw size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                  Versão Protegida
                </button>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="card col-span-full py-12 text-center text-pink-400 dark:text-pink-500">
            <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-3xl bg-gradient-primary/10 mb-3">
              <FileX size={40} className="text-pink-300" />
            </div>
            <p className="font-medium">{search ? 'Nenhum arquivo encontrado.' : 'Nenhum arquivo protegido ainda.'}</p>
            {!search && <p className="mt-1 text-xs">Faça upload do seu primeiro arquivo para começar a proteger seus conteúdos.</p>}
          </div>
        )}
      </div>

      <Modal open={!!confirm} onClose={() => setConfirm(null)} title="Gerenciar arquivo">
        {confirm && (
          <div className="space-y-3">
            <p className="text-sm text-meell-600">
              <strong>{confirm.title}</strong> ({confirm.meell_id})
            </p>
            <div className="flex flex-col gap-2">
              <button onClick={() => revoke(confirm)} className="btn-ghost">
                <Lock size={14} /> Revogar proteção
              </button>
              <button onClick={() => remove(confirm)} className="rounded-2xl bg-rose-50 dark:bg-rose-900/30 px-4 py-3 text-sm font-semibold text-rose-600 ring-1 ring-rose-100 dark:ring-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/50">
                <Trash2 size={14} /> Excluir permanentemente
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ---------------- Clients ---------------- */
function ClientsView({ clients, deliveries, onChange, logActivity }: {
  clients: ClientRow[];
  deliveries: DeliveryWithRelations[];
  onChange: () => void;
  logActivity: (e: string, d?: string) => void;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<ClientRow | null>(null);

  async function addClient(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase.from('clients').insert({
      user_id: user.id, name, email, notes,
    });
    if (error) { toast(error.message, 'error'); return; }
    await logActivity('client_created', `Cliente "${name}" cadastrado`);
    toast('Cliente cadastrado!', 'success');
    setName(''); setEmail(''); setNotes(''); setOpen(false);
    onChange();
  }

  async function remove(c: ClientRow) {
    await supabase.from('clients').delete().eq('id', c.id);
    await logActivity('client_deleted', `Cliente "${c.name}" removido`);
    toast('Cliente removido.', 'success');
    setConfirmDelete(null);
    onChange();
  }

  const filtered = clients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) || c.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="section-title">Meus clientes</h1>
          <p className="text-sm text-meell-500 dark:text-slate-400">{clients.length} cliente(s) cadastrado(s)</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-pink-300 dark:text-slate-500" />
            <input className="input pl-9" placeholder="Buscar cliente..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button onClick={() => setOpen(true)} className="btn-primary"><Plus size={16} /> Novo cliente</button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((c) => {
          const count = deliveries.filter((d) => d.client_id === c.id).length;
          return (
            <div key={c.id} className="card">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-primary text-sm font-bold text-white shadow-glow">
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-meell-800 dark:text-slate-100">{c.name}</div>
                  <div className="truncate text-xs text-meell-400 dark:text-slate-500">{c.email}</div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-meell-500 dark:text-slate-400">
                <span>{count} entrega(s)</span>
                <span>{timeAgo(c.created_at)}</span>
              </div>
              {c.notes && <p className="mt-2 text-xs text-meell-400 dark:text-slate-500">{c.notes}</p>}
              <button onClick={() => setConfirmDelete(c)} className="mt-3 text-xs text-rose-500 hover:text-rose-700">
                Remover
              </button>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="card col-span-full py-12 text-center text-pink-400 dark:text-pink-500">
            <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-3xl bg-gradient-primary/10 mb-3">
              <UserX size={40} className="text-pink-300" />
            </div>
            <p className="font-medium">{search ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado ainda.'}</p>
            {!search && <p className="mt-1 text-xs">Cadastre seu primeiro cliente para começar a enviar entregas seguras.</p>}
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Cadastrar cliente">
        <form onSubmit={addClient} className="space-y-3">
          <div>
            <label className="label">Nome</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="label">E-mail</label>
            <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label">Notas (opcional)</label>
            <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <button type="submit" className="btn-primary w-full">Cadastrar</button>
        </form>
      </Modal>

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Confirmar exclusão">
        {confirmDelete && (
          <div className="space-y-3">
            <p className="text-sm text-meell-600 dark:text-slate-300">
              Tem certeza que deseja excluir o cliente <strong>{confirmDelete.name}</strong>?
              Esta ação não pode ser desfeita.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)} className="btn-ghost flex-1">Cancelar</button>
              <button onClick={() => remove(confirmDelete)} className="flex-1 rounded-2xl bg-rose-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-600">
                <Trash2 size={14} className="inline" /> Excluir
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ---------------- Deliveries ---------------- */
function DeliveriesView({ files, clients, deliveries, onChange, logActivity }: {
  files: ProtectedFile[];
  clients: ClientRow[];
  deliveries: DeliveryWithRelations[];
  onChange: () => void;
  logActivity: (e: string, d?: string) => void;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [fileId, setFileId] = useState('');
  const [clientId, setClientId] = useState('');
  const [downloadLimit, setDownloadLimit] = useState(3);
  const [expiresDays, setExpiresDays] = useState(30);
  const [protectionMode, setProtectionMode] = useState<'default' | 'watermark' | 'none'>('default');
  const [wmClientName, setWmClientName] = useState(true);
  const [wmEmail, setWmEmail] = useState(false);
  const [wmCopyId, setWmCopyId] = useState(true);
  const [wmEmailMask, setWmEmailMask] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [confirmRevoke, setConfirmRevoke] = useState<DeliveryWithRelations | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !fileId || !clientId) return;
    const token = genToken();
    const expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000).toISOString();
    const watermarkConfig = protectionMode === 'watermark'
      ? { show_client_name: wmClientName, show_email: wmEmail, show_copy_id: wmCopyId, email_mask: wmEmailMask }
      : null;
    const { data, error } = await supabase.from('deliveries').insert({
      file_id: fileId,
      client_id: clientId,
      secure_token: token,
      download_limit: downloadLimit,
      expires_at: expiresAt,
      revoked: false,
      protection_mode: protectionMode,
      watermark_config: watermarkConfig,
    }).select('*').maybeSingle();
    if (error) { toast(error.message, 'error'); return; }
    if (data) {
      await supabase.from('delivery_events').insert({
        delivery_id: (data as Delivery).id,
        event_type: 'created',
        actor_id: user.id,
      });
    }
    const file = files.find((f) => f.id === fileId);
    const client = clients.find((c) => c.id === clientId);
    await logActivity('delivery_created', `Entrega de "${file?.title}" para "${client?.name}"`);
    toast('Entrega criada! Link seguro gerado.', 'success');
    setOpen(false);
    onChange();
  }

  async function toggleRevoke(d: DeliveryWithRelations) {
    await supabase.from('deliveries').update({ revoked: !d.revoked }).eq('id', d.id);
    await supabase.from('delivery_events').insert({
      delivery_id: d.id,
      event_type: d.revoked ? 'created' : 'revoked',
      actor_id: user?.id,
    });
    await logActivity(d.revoked ? 'delivery_reenabled' : 'delivery_revoked', `Entrega ${d.revoked ? 'reativada' : 'revogada'}`);
    toast(d.revoked ? 'Entrega reativada.' : 'Entrega revogada.', 'success');
    onChange();
  }

  async function toggleAllowResharing(d: DeliveryWithRelations) {
    const newValue = d.allow_resharing === false ? true : false;
    await supabase.from('deliveries').update({ allow_resharing: newValue }).eq('id', d.id);
    toast(newValue ? 'Reenvio ativado.' : 'Reenvio desativado.', 'success');
    onChange();
  }

  const link = (t: string) => { const base = window.location.pathname.replace(/\/+$/, ''); return `${window.location.origin}${base}/#/app?token=${t}`; };

  const filtered = deliveries.filter((d) => {
    const q = search.toLowerCase();
    return !q || (d.file?.title ?? '').toLowerCase().includes(q) || (d.client?.name ?? '').toLowerCase().includes(q);
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="section-title">Entregas</h1>
          <p className="text-sm text-meell-500 dark:text-slate-400">{deliveries.length} entrega(s) · links seguros</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-pink-300 dark:text-slate-500" />
            <input className="input pl-9" placeholder="Buscar entrega..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button onClick={() => setOpen(true)} className="btn-primary" disabled={files.length === 0 || clients.length === 0}>
            <Plus size={16} /> Nova entrega
          </button>
        </div>
      </div>

      {files.length === 0 || clients.length === 0 ? (
        <div className="card py-8 text-center text-sm text-pink-400">
          Você precisa cadastrar ao menos um arquivo protegido e um cliente antes de criar entregas.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((d) => {
            const expired = d.expires_at && new Date(d.expires_at) < new Date();
            const status = d.revoked ? 'Revogada' : expired ? 'Expirada' : 'Ativa';
            const statusStyle = d.revoked
              ? 'badge-danger'
              : expired
              ? 'badge-warning'
              : 'badge-success';
            return (
              <div key={d.id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-meell-800 dark:text-slate-100">{d.file?.title}</div>
                    <div className="text-xs text-meell-400 dark:text-slate-500">Para {d.client?.name} · {d.client?.email}</div>
                  </div>
                  <span className={`pill ${statusStyle}`}>
                    <Lock size={11} /> {status}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 text-xs text-meell-500 dark:text-slate-400 sm:grid-cols-4">
                  <div><span className="text-meell-400 dark:text-slate-500">Downloads:</span> {d.download_count}/{d.download_limit}</div>
                  <div><span className="text-meell-400 dark:text-slate-500">Expira:</span> {formatDate(d.expires_at)}</div>
                  <div><span className="text-meell-400 dark:text-slate-500">Último download:</span> {timeAgo(d.last_downloaded_at)}</div>
                  <div><span className="text-meell-400 dark:text-slate-500">Criada:</span> {timeAgo(d.created_at)}</div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(link(d.secure_token));
                      setCopied(d.id);
                      toast('Link copiado!', 'success');
                      setTimeout(() => setCopied(null), 1500);
                    }}
                    className="btn-ghost"
                  >
                    {copied === d.id ? <Check size={14} /> : <Copy size={14} />} Copiar link
                  </button>
                  <button onClick={() => setConfirmRevoke(d)} className="btn-ghost">
                    <RefreshCw size={14} /> {d.revoked ? 'Reativar' : 'Revogar'}
                  </button>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="card py-12 text-center text-pink-400 dark:text-pink-500">
              <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-3xl bg-gradient-primary/10 mb-3">
                <Send size={40} className="text-pink-300" />
              </div>
              <p className="font-medium">{search ? 'Nenhuma entrega encontrada.' : 'Nenhuma entrega criada ainda.'}</p>
              {!search && <p className="mt-1 text-xs">Crie uma entrega segura para compartilhar arquivos protegidos com seus clientes.</p>}
            </div>
          )}
        </div>
      )}

      <Modal open={!!confirmRevoke} onClose={() => setConfirmRevoke(null)} title="Confirmar alteração">
        {confirmRevoke && (
          <div className="space-y-3">
            <p className="text-sm text-meell-600 dark:text-slate-300">
              Tem certeza que deseja {confirmRevoke.revoked ? 'reativar' : 'revogar'} esta entrega?
              {confirmRevoke.revoked ? 'O cliente poderá acessar o link novamente.' : 'O cliente não poderá mais acessar o link.'}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmRevoke(null)} className="btn-ghost flex-1">Cancelar</button>
              <button onClick={() => toggleRevoke(confirmRevoke)} className="flex-1 rounded-2xl bg-rose-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-600">
                <RefreshCw size={14} className="inline" /> {confirmRevoke.revoked ? 'Reativar' : 'Revogar'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={open} onClose={() => setOpen(false)} title="Nova entrega segura">
        <form onSubmit={create} className="space-y-3">
          <div>
            <label className="label">Arquivo protegido</label>
            <select className="input" value={fileId} onChange={(e) => setFileId(e.target.value)} required>
              <option value="">Selecione...</option>
              {files.filter((f) => f.status === 'protected').map((f) => (
                <option key={f.id} value={f.id}>{f.title} ({f.meell_id})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Cliente</label>
            <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)} required>
              <option value="">Selecione...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Limite de downloads</label>
              <input type="number" min={1} className="input" value={downloadLimit} onChange={(e) => setDownloadLimit(Number(e.target.value))} />
            </div>
            <div>
              <label className="label">Expira em (dias)</label>
              <input type="number" min={1} className="input" value={expiresDays} onChange={(e) => setExpiresDays(Number(e.target.value))} />
            </div>
          </div>

          <div className="rounded-2xl bg-pink-50/50 dark:bg-pink-900/15 p-3 ring-1 ring-pink-100 dark:ring-pink-900/30">
            <div className="text-sm font-semibold text-meell-800">Proteção da cópia</div>
            <p className="mt-1 text-xs text-meell-500">
              O arquivo original permanece privado. O Meell Protect pode gerar uma cópia identificada exclusivamente para esta entrega, facilitando o rastreamento em caso de compartilhamento indevido.
            </p>
            <div className="mt-3 space-y-2">
              <label className="flex items-center gap-2 text-sm text-meell-700">
                <input type="radio" name="protection" value="default" checked={protectionMode === 'default'} onChange={() => setProtectionMode('default')} />
                Padrão — identificação Meell Protect
              </label>
              <label className="flex items-center gap-2 text-sm text-meell-700">
                <input type="radio" name="protection" value="watermark" checked={protectionMode === 'watermark'} onChange={() => setProtectionMode('watermark')} />
                Marca d'água personalizada
              </label>
              <label className="flex items-center gap-2 text-sm text-meell-700">
                <input type="radio" name="protection" value="none" checked={protectionMode === 'none'} onChange={() => setProtectionMode('none')} />
                Sem marca visual
              </label>
            </div>
            {protectionMode === 'watermark' && (
              <div className="mt-3 space-y-2 border-t border-pink-100 dark:border-pink-900/30 pt-3">
                <div className="text-xs font-medium text-meell-600">Dados a exibir na marca d'água:</div>
                <label className="flex items-center gap-2 text-xs text-meell-700">
                  <input type="checkbox" checked={wmClientName} onChange={(e) => setWmClientName(e.target.checked)} />
                  Nome do cliente
                </label>
                <label className="flex items-center gap-2 text-xs text-meell-700">
                  <input type="checkbox" checked={wmEmail} onChange={(e) => setWmEmail(e.target.checked)} />
                  E-mail do cliente
                </label>
                {wmEmail && (
                  <label className="flex items-center gap-2 text-xs text-meell-500">
                    <input type="checkbox" checked={wmEmailMask} onChange={(e) => setWmEmailMask(e.target.checked)} className="ml-4" />
                    Mascarar e-mail (ex: jo***@email.com)
                  </label>
                )}
                <label className="flex items-center gap-2 text-xs text-meell-700">
                  <input type="checkbox" checked={wmCopyId} onChange={(e) => setWmCopyId(e.target.checked)} />
                  ID da cópia
                </label>
              </div>
            )}
          </div>

          <button type="submit" className="btn-primary w-full">Criar entrega</button>
        </form>
      </Modal>
    </div>
  );
}

/* ---------------- Tracking ---------------- */
function TrackingView({ deliveries }: { deliveries: DeliveryWithRelations[] }) {
  const [selected, setSelected] = useState<DeliveryWithRelations | null>(null);
  const [events, setEvents] = useState<DeliveryEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  async function loadEvents(d: DeliveryWithRelations) {
    setSelected(d);
    setLoading(true);
    const { data } = await supabase
      .from('delivery_events')
      .select('*')
      .eq('delivery_id', d.id)
      .order('created_at', { ascending: true });
    setEvents((data as DeliveryEvent[]) ?? []);
    setLoading(false);
  }

  const filtered = deliveries.filter((d) => {
    const q = search.toLowerCase();
    return !q || (d.file?.title ?? '').toLowerCase().includes(q) || (d.client?.name ?? '').toLowerCase().includes(q);
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="section-title">Rastreamento e histórico</h1>
          <p className="text-sm text-meell-500 dark:text-slate-400">Linha do tempo completa de cada entrega.</p>
        </div>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-meell-300 dark:text-slate-500" />
          <input className="input pl-9" placeholder="Buscar por arquivo ou cliente..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          {filtered.map((d) => (
            <button
              key={d.id}
              onClick={() => loadEvents(d)}
              className={`card w-full text-left transition ${selected?.id === d.id ? 'ring-2 ring-pink-400 dark:ring-pink-600 shadow-glow' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-meell-800 dark:text-slate-100">{d.file?.title}</div>
                <span className="text-xs text-meell-400 dark:text-slate-500">{d.download_count} downloads</span>
              </div>
              <div className="text-xs text-meell-400 dark:text-slate-500">Para {d.client?.name} · {timeAgo(d.created_at)}</div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="card py-12 text-center text-pink-400 dark:text-pink-500">
              <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-3xl bg-gradient-primary/10 mb-3">
                <History size={40} className="text-pink-300" />
              </div>
              <p className="font-medium">{search ? 'Nenhuma entrega encontrada.' : 'Nenhuma entrega para rastrear.'}</p>
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="font-semibold text-meell-800">Linha do tempo</h2>
          {!selected && <p className="mt-3 text-sm text-meell-400">Selecione uma entrega para ver a linha do tempo.</p>}
          {selected && (
            <div className="mt-4">
              {loading && <p className="text-sm text-meell-400">Carregando...</p>}
              {!loading && (
                <div className="space-y-3">
                  {events.length === 0 && <p className="text-sm text-meell-400">Nenhum evento registrado.</p>}
                  {events.map((ev, i) => (
                    <div key={ev.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`h-3 w-3 rounded-full ${eventColor(ev.event_type)}`} />
                        {i < events.length - 1 && <div className="h-full w-0.5 flex-1 bg-pink-100 dark:bg-pink-900/30" />}
                      </div>
                      <div className="pb-3">
                        <div className="text-sm font-medium text-meell-700">{eventLabel(ev.event_type, ev.meta)}</div>
                        <div className="text-xs text-meell-400">{formatDate(ev.created_at)}</div>
                        {ev.event_type === 'shared' && ev.meta && (
                          <div className="mt-1 rounded-2xl bg-blue-50 px-3 py-2 text-xs text-blue-700 ring-1 ring-blue-100">
                            <div className="flex items-center gap-1.5 font-semibold">
                              <Share2 size={12} /> {String((ev.meta as Record<string, unknown>).shared_by_name ?? 'Desconhecido')} compartilhou com {String((ev.meta as Record<string, unknown>).shared_with_name ?? 'Desconhecido')}
                            </div>
                            {!!((ev.meta as Record<string, unknown>).shared_by_email || (ev.meta as Record<string, unknown>).shared_with_email) && (
                              <div className="mt-0.5 text-[11px] text-blue-500">
                                {String((ev.meta as Record<string, unknown>).shared_by_email ?? '')} → {String((ev.meta as Record<string, unknown>).shared_with_email ?? '')}
                              </div>
                            )}
                            {!!(ev.meta as Record<string, unknown>).new_copy_id && (
                              <div className="mt-0.5 text-[11px] text-blue-400">
                                Nova cópia: {String((ev.meta as Record<string, unknown>).new_copy_id)}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {selected && (
            <div className="mt-4 border-t border-pink-50 dark:border-pink-900/20 pt-3 text-xs text-meell-500">
              <div className="flex justify-between"><span>Token:</span><code className="text-meell-400">{selected.secure_token.slice(0, 12)}...</code></div>
              <div className="mt-1 flex justify-between"><span>Último acesso:</span><span>{timeAgo(selected.first_viewed_at)}</span></div>
              <div className="mt-1 flex justify-between"><span>Último download:</span><span>{timeAgo(selected.last_downloaded_at)}</span></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function eventColor(t: string) {
  return {
    created: 'bg-pink-500',
    viewed: 'bg-violet-500',
    downloaded: 'bg-emerald-500',
    revoked: 'bg-rose-500',
    expired: 'bg-amber-500',
    shared: 'bg-blue-500',
    blocked: 'bg-rose-400',
  }[t] ?? 'bg-pink-300';
}
function eventLabel(t: string, meta?: Record<string, unknown> | null) {
  if (t === 'shared' && meta?.shared_by_name && meta?.shared_with_name) {
    return `${String(meta.shared_by_name)} compartilhou com ${String(meta.shared_with_name)}`;
  }
  return {
    created: 'Entrega criada',
    viewed: 'Cliente acessou o link',
    downloaded: 'Cliente baixou o arquivo',
    revoked: 'Entrega revogada',
    expired: 'Entrega expirou',
    shared: 'Arquivo compartilhado',
    blocked: 'Download bloqueado',
  }[t] ?? t;
}

/* ---------------- Plan ---------------- */
function PlanView({ profile, onChange, logActivity }: {
  profile: NonNullable<ReturnType<typeof useAuth>['profile']>;
  onChange: () => Promise<void>;
  logActivity: (e: string, d?: string) => void;
}) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from('plans').select('*').order('sort_order', { ascending: true }).then(({ data }) => {
      if (data) setPlans(data as Plan[]);
    });
  }, []);

  async function changePlan(p: Plan) {
    if (p.id === profile.plan_id) return;
    setLoading(true);
    await supabase.from('profiles').update({ plan_id: p.id }).eq('id', profile.id);
    if (p.id !== 'free') {
      await supabase.from('subscriptions').upsert({
        user_id: profile.id,
        plan_id: p.id,
        status: 'active',
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        provider: 'manual',
      }, { onConflict: 'user_id' });
    } else {
      await supabase.from('subscriptions').update({ status: 'canceled' }).eq('user_id', profile.id);
    }
    await logActivity('plan_changed', `Plano alterado para ${p.name}`);
    toast(`Plano alterado para ${p.name}!`, 'success');
    setLoading(false);
    await onChange();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="section-title">Plano e assinatura</h1>
        <p className="text-sm text-meell-500">Assinatura mensal recorrente, estilo Netflix.</p>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase text-meell-400">Plano atual</div>
            <div className="text-xl font-bold text-meell-800">{plans.find((p) => p.id === profile.plan_id)?.name ?? 'Grátis'}</div>
          </div>
          <span className="pill badge-success"><Shield size={12} /> Ativa</span>
        </div>
        <div className="mt-3 text-xs text-meell-400">
          A arquitetura do Meell Protect já está preparada para integração com pagamentos recorrentes reais (ex.: Stripe). Por enquanto, a troca de plano é registrada no banco para demonstração.
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        {plans.map((p) => (
          <div key={p.id} className={`card flex flex-col ${p.id === profile.plan_id ? 'ring-2 ring-pink-400 dark:ring-pink-600 shadow-glow' : ''}`}>
            <div className="text-sm font-semibold text-meell-500">{p.name}</div>
            <div className="mt-1 text-2xl font-bold text-meell-800">{p.price_label}</div>
            <ul className="mt-3 space-y-1 text-xs text-meell-600">
              <li>{p.max_files} arquivos</li>
              <li>{formatBytes(p.max_storage_mb * 1024 * 1024)}</li>
              <li>{p.max_deliveries} entregas/mês</li>
              {p.watermark && <li>Marca d'água</li>}
              {p.advanced_tracking && <li>Rastreamento avançado</li>}
            </ul>
            <button
              onClick={() => {
                if (p.id === profile.plan_id) return;
                if (p.id === 'free') { changePlan(p); return; }
                if (p.checkout_url) window.open(p.checkout_url, '_blank', 'noopener');
                else changePlan(p);
              }}
              disabled={loading || p.id === profile.plan_id}
              className={p.id === profile.plan_id ? 'btn-ghost mt-4' : 'btn-primary mt-4'}
            >
              {p.id === profile.plan_id ? 'Plano atual' : p.id === 'free' ? 'Voltar para Grátis' : `Assinar ${p.name}`}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Profile / Settings ---------------- */
function ProfileView() {
  const { profile, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ display_name: name }).eq('id', profile.id);
    if (error) toast(error.message, 'error');
    else { toast('Perfil atualizado!', 'success'); await refreshProfile(); }
    setSaving(false);
  }

  return (
    <div className="max-w-xl space-y-5">
      <div>
        <h1 className="section-title">Perfil</h1>
        <p className="text-sm text-meell-500">Suas informações públicas no Meell Protect.</p>
      </div>
      <form onSubmit={save} className="card space-y-4">
        <div>
          <label className="label">Nome</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">E-mail</label>
          <input className="input" value={profile?.email ?? ''} disabled />
        </div>
        <div>
          <label className="label">Tipo de conta</label>
          <input className="input" value={profile?.account_type === 'creator' ? 'Criador/Vendedor' : 'Cliente final'} disabled />
        </div>
        <button type="submit" disabled={saving} className="btn-primary">Salvar</button>
      </form>
    </div>
  );
}

function SettingsView() {
  const { signOut } = useAuth();
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' ||
        (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  function toggleDark() {
    const next = !darkMode;
    setDarkMode(next);
    if (next) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  return (
    <div className="max-w-xl space-y-5">
      <div>
        <h1 className="section-title">Configurações</h1>
        <p className="text-sm text-meell-500 dark:text-slate-400">Preferências da conta.</p>
      </div>
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-meell-800 dark:text-slate-100">Notificações por e-mail</div>
            <div className="text-xs text-meell-400 dark:text-slate-500">Receber alertas de download e acesso</div>
          </div>
          <input type="checkbox" defaultChecked className="h-5 w-5 rounded accent-meell-500" />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-meell-800 dark:text-slate-100">Modo escuro</div>
            <div className="text-xs text-meell-400 dark:text-slate-500">Alternar entre tema claro e escuro</div>
          </div>
          <button
            onClick={toggleDark}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${darkMode ? 'bg-gradient-primary' : 'bg-gray-300'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${darkMode ? 'translate-x-6' : 'translate-x-1'}`}>
              {darkMode ? <Moon size={10} className="mx-auto text-meell-600" /> : <Sun size={10} className="mx-auto text-amber-500" />}
            </span>
          </button>
        </div>
        <div className="border-t border-meell-50 dark:border-slate-700 pt-3">
          <button onClick={signOut} className="btn-ghost text-rose-600">
            <LogOut size={14} /> Encerrar sessão
          </button>
        </div>
      </div>

      {/* Sobre o Meell Protect */}
      <div className="card space-y-3">
        <h2 className="font-semibold text-meell-800 dark:text-slate-100">Sobre o Meell Protect</h2>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-glow">
            <Shield size={24} />
          </div>
          <div>
            <div className="text-base font-bold text-meell-800">Meell Protect</div>
            <div className="text-sm text-meell-500">Versão 1.0 Beta</div>
            <div className="text-xs text-meell-400">Desenvolvido por Meell</div>
          </div>
        </div>
        <div className="rounded-2xl bg-pink-50/50 dark:bg-pink-900/15 p-3 text-xs text-meell-600 space-y-1 ring-1 ring-pink-100 dark:ring-pink-900/30">
          <div className="font-semibold text-meell-700 mb-2">Funcionalidades implementadas</div>
          <div className="flex items-center gap-1.5"><Check size={12} className="text-emerald-500" /> Proteção de arquivos com ID Meell único</div>
          <div className="flex items-center gap-1.5"><Check size={12} className="text-emerald-500" /> Upload único, múltiplos arquivos e pasta inteira</div>
          <div className="flex items-center gap-1.5"><Check size={12} className="text-emerald-500" /> Fingerprint invisível: LSB em PNG, metadata em JPEG</div>
          <div className="flex items-center gap-1.5"><Check size={12} className="text-emerald-500" /> Fingerprint WEBP: chunk RIFF "MEEP" (sem alterar pixels)</div>
          <div className="flex items-center gap-1.5"><Check size={12} className="text-emerald-500" /> Watermark + assinatura persistente em PDFs</div>
          <div className="flex items-center gap-1.5"><Check size={12} className="text-emerald-500" /> Download: Cópia Idêntica e Versão Protegida</div>
          <div className="flex items-center gap-1.5"><Check size={12} className="text-emerald-500" /> Entrega segura com link autenticado</div>
          <div className="flex items-center gap-1.5"><Check size={12} className="text-emerald-500" /> Rastreamento completo (linha do tempo + evento "compartilhou")</div>
          <div className="flex items-center gap-1.5"><Check size={12} className="text-emerald-500" /> Limite de downloads e expiração por entrega</div>
          <div className="flex items-center gap-1.5"><Check size={12} className="text-emerald-500" /> Verificação de autenticidade com cadeia de custódia</div>
          <div className="flex items-center gap-1.5"><Check size={12} className="text-emerald-500" /> Compartilhamento protegido: cliente gera cópia vinculada</div>
          <div className="flex items-center gap-1.5"><Check size={12} className="text-emerald-500" /> Planos e assinatura (Grátis, Start, Pro, Business)</div>
        </div>
        <div className="text-[11px] text-meell-300 text-center">
          © {new Date().getFullYear()} Meell · ecossistema Agenda Creator Pro
        </div>
      </div>
    </div>
  );
}
