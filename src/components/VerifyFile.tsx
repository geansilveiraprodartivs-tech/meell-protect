import { useState, useRef, useCallback } from 'react';
import { Upload, ShieldCheck, ShieldX, ShieldAlert, AlertCircle, Fingerprint, FileCheck2, Calendar, User, Download, Hash, Package, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from './Toaster';
import { formatDate } from '../lib/utils';

type VerifyStatus = 'idle' | 'loading' | 'identified' | 'not_found' | 'invalid' | 'error';

interface ChainNode {
  copy_id: string;
  fingerprint_id: string;
  protection_method: string;
  recipient_type: string;
  created_at: string;
  client: { id: string; name: string } | null;
  shared_by_client_id: string | null;
}

interface VerifyResult {
  status: Exclude<VerifyStatus, 'idle' | 'loading' | 'error'>;
  fingerprint_id?: string;
  layer?: string;
  method?: string;
  file_hash: string;
  copy?: {
    copy_id: string;
    fingerprint_id: string;
    protection_method: string;
    protection_version: number;
    recipient_type: string;
    original_hash: string | null;
    copy_hash: string | null;
    created_at: string;
    is_owner_view: boolean;
    parent_copy_id?: string | null;
    shared_by_client_id?: string | null;
    chain?: ChainNode[];
    file: {
      meell_id: string;
      title: string;
      file_name: string;
      mime_type: string;
      downloads_count: number;
      created_at: string;
    } | null;
    owner: {
      id: string;
      display_name: string;
      account_type: string;
    } | null;
    client: {
      id: string;
      name: string;
      created_at: string;
    } | null;
    delivery: {
      id: string;
      created_at: string;
      download_count: number;
      last_downloaded_at: string | null;
    } | null;
  };
}

function maskFp(fp: string | undefined): string {
  if (!fp) return '—';
  return fp.substring(0, 8) + '••••-••••-' + fp.substring(24);
}

function protectionLabel(method: string): string {
  switch (method) {
    case 'image_png_lsb': return 'PNG — Metadata + LSB';
    case 'image_jpeg_meta': return 'JPEG — Metadata assinada';
    case 'image_webp_riff': return 'WEBP — Chunk RIFF "MEEP"';
    case 'pdf_xmp_overlay': return 'PDF — XMP + Overlay';
    case 'tracking_only': return 'Rastreamento de entrega';
    case 'metadata_only': return 'Apenas metadata';
    default: return method;
  }
}

function layerLabel(layer: string | undefined): string {
  switch (layer) {
    case 'metadata': return 'Metadata (EXIF/XMP/tEXt)';
    case 'lsb': return 'LSB (pixels)';
    case 'overlay': return 'Overlay (texto)';
    default: return '—';
  }
}

export default function VerifyFile() {
  const [status, setStatus] = useState<VerifyStatus>('idle');
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const verifyFile = useCallback(async (file: File) => {
    setStatus('loading');
    setFileName(file.name);
    setErrorMsg('');
    setResult(null);

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.access_token) {
        setStatus('error');
        setErrorMsg('Você precisa estar autenticado para verificar arquivos.');
        return;
      }

      const formData = new FormData();
      formData.append('file', file);

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const response = await fetch(`${supabaseUrl}/functions/v1/verify-file`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.session.access_token}` },
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Erro na verificação' }));
        setStatus('error');
        setErrorMsg(errData.error || `Erro ${response.status}`);
        return;
      }

      const data = await response.json();
      if (!data.ok) {
        setStatus('error');
        setErrorMsg(data.error || 'Erro desconhecido');
        return;
      }

      setResult(data as VerifyResult);
      setStatus(data.status);
      if (data.status === 'identified') toast('Arquivo protegido identificado!', 'success');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Erro de conexão');
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) verifyFile(file);
  }, [verifyFile]);

  const handleSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) verifyFile(file);
  }, [verifyFile]);

  const reset = () => {
    setStatus('idle');
    setResult(null);
    setErrorMsg('');
    setFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-meell-800">Verificar Arquivo</h1>
        <p className="text-sm text-meell-500">
          Envie um arquivo para verificar se ele foi protegido pelo Meell Protect e rastrear sua origem.
        </p>
      </div>

      {status === 'idle' && (
        <div
          className={`card flex cursor-pointer flex-col items-center justify-center gap-3 py-16 transition ${dragOver ? 'ring-2 ring-meell-400' : 'hover:ring-2 hover:ring-meell-200'}`}
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-meell-100 to-lilas-100">
            <Upload size={28} className="text-meell-500" />
          </div>
          <div className="text-sm font-semibold text-meell-700">Arraste o arquivo aqui ou selecione do computador</div>
          <div className="text-xs text-meell-400">JPG, PNG, WEBP, PDF — até 20 MB</div>
          <button className="btn-primary mt-2"><FileCheck2 size={16} /> Selecionar arquivo</button>
          <input ref={fileInputRef} type="file" style={{ display: 'none' }} accept="image/jpeg,image/png,image/webp,application/pdf" onChange={handleSelect} />
        </div>
      )}

      {status === 'loading' && (
        <div className="card flex flex-col items-center gap-4 py-16">
          <RefreshCw size={28} className="animate-spin text-meell-500" />
          <p className="text-sm text-meell-500">Analisando <strong>{fileName}</strong>…</p>
        </div>
      )}

      {status === 'error' && (
        <div className="card space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-50 text-rose-500"><AlertCircle size={22} /></div>
            <h2 className="text-lg font-semibold text-meell-800">Erro na verificação</h2>
          </div>
          <p className="text-sm text-meell-600">{errorMsg}</p>
          <button className="btn-soft" onClick={reset}>Tentar novamente</button>
        </div>
      )}

      {status === 'identified' && result?.copy && (
        <div className="card space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><ShieldCheck size={22} /></div>
            <div>
              <h2 className="text-lg font-semibold text-meell-800">Arquivo protegido identificado</h2>
              <span className={`pill mt-1 ${result.copy.recipient_type === 'owner' ? 'bg-lilas-50 text-lilas-700' : 'bg-meell-50 text-meell-700'}`}>
                {result.copy.recipient_type === 'owner' ? 'Cópia protegida do proprietário' : 'Cópia protegida de entrega'}
              </span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field icon={FileCheck2} label="ID da Cópia" value={result.copy.copy_id} />
            <Field icon={Fingerprint} label="Fingerprint" value={maskFp(result.fingerprint_id)} mono />
            <Field icon={Package} label="Arquivo Original" value={result.copy.file?.title || result.copy.file?.file_name || '—'} />
            <Field icon={FileCheck2} label="Meell ID" value={result.copy.file?.meell_id || '—'} />
            <Field icon={User} label="Proprietário" value={result.copy.owner?.display_name || (result.copy.is_owner_view ? 'Você' : '—')} />
            <Field icon={Calendar} label="Data de Proteção" value={formatDate(result.copy.created_at)} />
            <Field icon={ShieldCheck} label="Tipo de Proteção" value={protectionLabel(result.copy.protection_method)} />
            <Field icon={ShieldCheck} label="Versão da Proteção" value={`v${result.copy.protection_version}`} />
            {result.copy.client && <Field icon={User} label="Cliente / Destinatário" value={result.copy.client.name} />}
            {result.copy.delivery && <Field icon={Calendar} label="Entrega" value={formatDate(result.copy.delivery.created_at)} />}
            {result.copy.delivery && <Field icon={Download} label="Downloads da Entrega" value={String(result.copy.delivery.download_count)} />}
            {result.copy.file && <Field icon={Download} label="Downloads do Arquivo" value={String(result.copy.file.downloads_count)} />}
            <Field icon={Hash} label="Hash da Cópia Protegida" value={result.copy.copy_hash ? result.copy.copy_hash.substring(0, 32) + '…' : '—'} mono />
            <Field icon={ShieldCheck} label="Camada Detectada" value={layerLabel(result.layer)} />
          </div>

          {/* Chain of custody — only shown when chain is present (owner view only) */}
          {result.copy.chain && result.copy.chain.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-meell-400">Cadeia de custódia</div>
              <div className="space-y-2">
                {result.copy.chain.map((node, i) => (
                  <div key={node.copy_id} className="flex items-start gap-2">
                    <div className="mt-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-meell-100 text-[10px] font-bold text-meell-600">
                      {i + 1}
                    </div>
                    <div className="rounded-xl bg-meell-50 px-3 py-2 text-xs text-meell-700 flex-1">
                      <span className="font-semibold">{node.client?.name ?? 'Proprietário'}</span>
                      {' · '}
                      <span className="font-mono">{node.copy_id.substring(0, 16)}…</span>
                      <span className="ml-2 text-meell-400">{new Date(node.created_at).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </div>
                ))}
                {/* Current copy (leaf) */}
                <div className="flex items-start gap-2">
                  <div className="mt-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700">
                    {result.copy.chain.length + 1}
                  </div>
                  <div className="rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800 font-semibold flex-1">
                    {result.copy.client?.name ?? 'Proprietário'} · <span className="font-mono">{result.copy.copy_id.substring(0, 16)}…</span>
                    <span className="ml-1 text-emerald-600">(esta cópia)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <button className="btn-soft" onClick={reset}>Verificar outro arquivo</button>
        </div>
      )}

      {status === 'not_found' && (
        <div className="card space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-meell-50 text-meell-400"><ShieldX size={22} /></div>
            <h2 className="text-lg font-semibold text-meell-800">Proteção Meell não identificada</h2>
          </div>
          <p className="text-sm text-meell-600">
            Não encontramos um identificador Meell Protect válido neste arquivo. Ele pode ser uma
            cópia idêntica, um arquivo nunca protegido ou ter passado por uma transformação que
            removeu a identificação.
          </p>
          {result?.file_hash && <Field icon={Hash} label="Hash do Arquivo Enviado" value={result.file_hash.substring(0, 32) + '…'} mono />}
          <button className="btn-soft" onClick={reset}>Verificar outro arquivo</button>
        </div>
      )}

      {status === 'invalid' && (
        <div className="card space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-600"><ShieldAlert size={22} /></div>
            <h2 className="text-lg font-semibold text-meell-800">Identificador encontrado, mas não reconhecido</h2>
          </div>
          <p className="text-sm text-meell-600">
            Encontramos um identificador no formato Meell Protect dentro do arquivo, mas ele não
            corresponde a nenhum registro válido no banco de dados. Isso pode indicar um
            identificador falsificado ou um registro que foi removido.
          </p>
          {result?.fingerprint_id && <Field icon={Fingerprint} label="Identificador Encontrado" value={maskFp(result.fingerprint_id)} mono />}
          <button className="btn-soft" onClick={reset}>Verificar outro arquivo</button>
        </div>
      )}
    </div>
  );
}

function Field({ icon: Icon, label, value, mono }: { icon: typeof FileCheck2; label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-2xl bg-meell-50/50 p-3 ring-1 ring-meell-50">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-meell-400">
        <Icon size={12} /> {label}
      </div>
      <div className={`mt-1 text-sm font-medium text-meell-800 ${mono ? 'font-mono text-xs' : ''}`}>{value}</div>
    </div>
  );
}
