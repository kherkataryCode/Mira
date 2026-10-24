'use client';
import { RefreshCw } from 'lucide-react';
import { useResource } from '@/lib/hooks';
import { relativeTime } from '@/lib/format';
import { Badge, Button, Card, ErrorNote, Loading, PageHeader } from '@/components/ui';

interface Health {
  generatedAt: string;
  disclaimer: string;
  api: { status: string; uptimeSeconds: number; node: string };
  database: { status: string; latencyMs: number };
  worker: { status: string; lastHeartbeatAt: string | null };
  jobs: { job: string; lastSuccessAt: string | null; lastFailureAt: string | null; lastFailure: string | null; failures24h: number }[];
  queue: { depth: number | null; pendingPush: number };
  ai: {
    demo: boolean;
    providers: { id: string; model: string; circuitOpen: boolean }[];
    monthSpendUsd: number;
    monthCalls: number;
    globalBudgetUsd: number;
    failures24h: { provider: string; errorClass: string | null; n: number }[];
  };
  integrations: { push: string; openclaw: string; demoMode: boolean };
}

const tone = (s: string) => (s === 'ok' ? 'positive' : 'accent');

export default function HealthPage() {
  const { data, error, loading, reload } = useResource<Health>('/system/health');
  return (
    <div>
      <PageHeader title="System health" subtitle="Owner-only, read-only snapshot." actions={<Button onClick={reload} pending={loading}><RefreshCw className="size-4" aria-hidden /> Refresh</Button>} />
      {error ? <ErrorNote message={error} onRetry={reload} /> : null}
      {loading && !data ? <Loading /> : null}
      {data ? (
        <div className="flex flex-col gap-4">
          <p className="rounded-2xl border border-sand/40 bg-sand/10 p-3 text-sm">{data.disclaimer} Generated {relativeTime(data.generatedAt)}.</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card><p className="eyebrow">API</p><p className="mt-2"><Badge tone={tone(data.api.status)}>{data.api.status}</Badge></p><p className="mt-2 text-xs text-muted">Up {Math.round(data.api.uptimeSeconds / 60)} min · {data.api.node}</p></Card>
            <Card><p className="eyebrow">Database</p><p className="mt-2"><Badge tone={tone(data.database.status)}>{data.database.status}</Badge></p><p className="mt-2 text-xs text-muted">{data.database.latencyMs} ms ping</p></Card>
            <Card><p className="eyebrow">Worker</p><p className="mt-2"><Badge tone={tone(data.worker.status)}>{data.worker.status}</Badge></p><p className="mt-2 text-xs text-muted">Heartbeat {data.worker.lastHeartbeatAt ? relativeTime(data.worker.lastHeartbeatAt) : 'never'}</p></Card>
            <Card><p className="eyebrow">Queue</p><p className="display display-md mt-2">{data.queue.depth ?? '—'}</p><p className="text-xs text-muted">{data.queue.pendingPush} push pending</p></Card>
          </div>
          <Card>
            <h2 className="mb-3 text-base font-semibold">Scheduled jobs</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <thead className="text-xs text-muted"><tr><th className="py-2 pr-3">Job</th><th className="pr-3">Last success</th><th className="pr-3">Failures 24h</th><th>Last failure</th></tr></thead>
                <tbody>
                  {data.jobs.map((j) => (
                    <tr key={j.job} className="border-t border-line">
                      <td className="py-2 pr-3 font-medium">{j.job}</td>
                      <td className="pr-3">{j.lastSuccessAt ? relativeTime(j.lastSuccessAt) : 'never'}</td>
                      <td className={`pr-3 ${j.failures24h ? 'text-accent-text' : ''}`}>{j.failures24h}</td>
                      <td className="text-xs text-muted">{j.lastFailure ? `${j.lastFailure} (${relativeTime(j.lastFailureAt)})` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="mb-2 text-base font-semibold">AI</h2>
              <p className="text-sm">{data.ai.demo ? 'Demo mode (no provider keys)' : data.ai.providers.map((p) => `${p.id}: ${p.model}${p.circuitOpen ? ' (paused)' : ''}`).join(' · ')}</p>
              <p className="mt-2 text-sm text-muted">This month: ${data.ai.monthSpendUsd.toFixed(4)} estimated of ${data.ai.globalBudgetUsd} global budget · {data.ai.monthCalls} calls</p>
              {data.ai.failures24h.length ? (
                <ul className="mt-2 text-sm">{data.ai.failures24h.map((f, i) => <li key={i}>{f.provider}: {f.errorClass} × {f.n}</li>)}</ul>
              ) : <p className="mt-2 text-sm text-muted">No provider failures in the last 24h.</p>}
            </Card>
            <Card>
              <h2 className="mb-2 text-base font-semibold">Integrations</h2>
              <ul className="text-sm">
                <li>Server push: {data.integrations.push}</li>
                <li>OpenClaw: {data.integrations.openclaw}</li>
                <li>Demo mode: {data.integrations.demoMode ? 'on' : 'off'}</li>
              </ul>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}
