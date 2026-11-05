import { useEffect, useState } from 'react';
import { KeyRound, Copy, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { Button } from '../components/ui';
import { useToast } from '../context/ToastContext';

type AgentKey = { id: number; name: string; prefix: string; scopes: string[]; expires_at: string; revoked: boolean };
export default function Integrations() {
  const { toast } = useToast();
  const [keys, setKeys] = useState<AgentKey[]>([]);
  const [name, setName] = useState('Telegram agent');
  const [scopes, setScopes] = useState(['schedule', 'documents']);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const report = (e: unknown) => toast(e instanceof Error ? e.message : 'Request failed', 'error');
  const load = () => api<AgentKey[]>('/integrations/keys').then(setKeys);
  useEffect(() => { load().catch(report); }, []);
  const create = async () => {
    setBusy(true);
    try {
      const result = await api<AgentKey & { token: string }>('/integrations/keys', { method: 'POST', body: JSON.stringify({ name, scopes, expires_days: 90 }) });
      setToken(result.token); await load();
    } catch (e) { report(e); } finally { setBusy(false); }
  };
  const revoke = async (id: number) => {
    try { await api(`/integrations/keys/${id}`, { method: 'DELETE' }); setToken(''); await load(); }
    catch (e) { report(e); }
  };
  return <div className="mx-auto max-w-3xl space-y-6 p-5 sm:p-8">
    <div><KeyRound className="mb-3 text-accent" /><h2 className="text-3xl font-semibold tracking-tight">Connect your agent</h2><p className="mt-2 text-sm text-muted">Let Hermes or another Telegram agent manage your study workspace through the API.</p></div>
    <section className="card space-y-4 p-6"><h3 className="font-semibold">Create an agent key</h3><label className="block text-xs">Connection name<input className="field mt-2" value={name} maxLength={80} onChange={e => setName(e.target.value)} /></label>
      <fieldset><legend className="mb-2 text-xs">Permissions · read, create, update, and delete within each selected area</legend><div className="flex flex-wrap gap-4">{['schedule', 'documents', 'notes', 'ai'].map(scope => <label key={scope} className="flex items-center gap-2 text-sm capitalize"><input type="checkbox" checked={scopes.includes(scope)} onChange={e => setScopes(current => e.target.checked ? [...current, scope] : current.filter(s => s !== scope))} />{scope}</label>)}</div></fieldset>
      <p className="text-xs text-muted">Keys expire after 90 days and only access your account. You can revoke them below.</p><Button disabled={!name.trim() || !scopes.length} loading={busy} onClick={create}>Create key</Button>
      {token && <div className="rounded-xl border border-line bg-canvas p-4"><p className="mb-2 text-sm font-medium">Copy now — this key is shown only once.</p><code className="block break-all text-xs">{token}</code><Button variant="secondary" className="mt-3" icon={<Copy size={14} />} onClick={async () => { try { await navigator.clipboard.writeText(token); toast('Key copied'); } catch { toast('Select and copy the key manually', 'error'); } }}>Copy key</Button><p className="mt-3 text-xs text-muted">Store it as STUDYOS_API_KEY on the machine running your agent. Keep it out of Telegram messages.</p></div>}
    </section>
    <section className="card p-6"><h3 className="mb-3 font-semibold">Your connections</h3>{keys.length === 0 && <p className="text-sm text-muted">No agent connections yet.</p>}{keys.map(key => <div key={key.id} className="flex items-center gap-3 border-b border-line py-4 last:border-0"><div className="min-w-0 flex-1"><p className="text-sm font-medium">{key.name} {key.revoked && '· Revoked'}</p><p className="mt-1 break-all text-xs text-muted">{key.prefix}… · {key.scopes.join(', ')} · expires {new Date(key.expires_at).toLocaleDateString()}</p></div><Button variant="ghost" disabled={key.revoked} onClick={() => revoke(key.id)} icon={<Trash2 size={14} />}>Revoke</Button></div>)}</section>
    <section className="card space-y-3 p-6 text-sm"><h3 className="font-semibold">How it works</h3><p>Telegram → your agent → StudyOS API → your private workspace.</p><p className="text-muted">Install the included integrations/hermes/studyos skill on your agent machine. Configure STUDYOS_URL and STUDYOS_API_KEY in the gateway environment, then restart the gateway. The setup guide is docs/TELEGRAM_AGENT.md in the project.</p><p className="text-muted">Example: “Schedule biology tomorrow at 18:00 for 45 minutes.” Your agent resolves the date and calls the schedule API. Send a file and ask it to upload the attachment; StudyOS indexes it for the tutor.</p><p className="text-xs text-muted">Creating a session adds it to your calendar. It does not send a timed Telegram reminder.</p></section>
  </div>;
}
