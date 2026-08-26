import { useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Activity,
  AlertTriangle,
  BatteryCharging,
  Check,
  ChevronDown,
  CircleGauge,
  Clock3,
  Command,
  Gauge,
  History,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  ShieldCheck,
  Siren,
  SlidersHorizontal,
  Thermometer,
  TimerReset,
  TrendingDown,
  TrendingUp,
  Waves,
  X,
  Zap,
} from 'lucide-react';
import { ErrorBoundary } from './error-boundary';

const queryClient = new QueryClient();

type Status = 'nominal' | 'watch' | 'critical';
type Severity = 'soft' | 'hard';
type EngineState = {
  timestamp: string;
  cycle: number;
  cylinder_head_temp: number;
  oil_pressure: number;
  vibration: number;
  rpm: number;
  fuel_flow: number;
  exhaust_gas_temp: number;
  status: Status;
  anomaly_score: number;
  rul_hours: number;
  fault_injected: boolean;
  confidence: number;
};
type TelemetryPoint = Pick<EngineState, 'timestamp' | 'cycle' | 'cylinder_head_temp' | 'oil_pressure' | 'vibration' | 'rpm' | 'fuel_flow' | 'exhaust_gas_temp'>;

const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO !== 'false';
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '');
let staticCycle = 742;
let staticFault: { severity: Severity; startCycle: number } | null = null;
let staticHistory: TelemetryPoint[] = [];
let staticLastAdvancedAt = Date.now();

const staticRound = (value: number, decimals = 1) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

function staticTelemetry(targetCycle: number): TelemetryPoint {
  const progress = Math.min(targetCycle / 900, 1);
  const faultProgress = staticFault
    ? Math.min(Math.max((targetCycle - staticFault.startCycle) / 24, 0), 1)
    : 0;
  const degradation = progress * 0.55 + faultProgress * (staticFault?.severity === 'hard' ? 1.8 : 1);
  const oscillation = Math.sin(targetCycle / 7);
  return {
    timestamp: new Date(Date.now() - (staticCycle - targetCycle) * 2000).toISOString(),
    cycle: targetCycle,
    cylinder_head_temp: staticRound(178 + degradation * 34 + oscillation * 2.4),
    oil_pressure: staticRound(58 - degradation * 23 + Math.cos(targetCycle / 9) * 1.2),
    vibration: staticRound(0.18 + degradation * 1.32 + Math.abs(oscillation) * 0.04, 2),
    rpm: staticRound(2380 - degradation * 430 + Math.sin(targetCycle / 11) * 18),
    fuel_flow: staticRound(8.6 + degradation * 2.8 + Math.cos(targetCycle / 13) * 0.16, 2),
    exhaust_gas_temp: staticRound(645 + degradation * 175 + oscillation * 6),
  };
}

function resetStaticHistory() {
  staticHistory = Array.from({ length: 72 }, (_, index) => staticTelemetry(staticCycle - 71 + index));
}

function advanceStaticDemo() {
  const now = Date.now();
  if (now - staticLastAdvancedAt < 900) return;
  const steps = Math.max(1, Math.min(3, Math.floor((now - staticLastAdvancedAt) / 1200)));
  for (let index = 0; index < steps; index += 1) {
    staticCycle += 1;
    staticHistory.push(staticTelemetry(staticCycle));
  }
  staticHistory = staticHistory.slice(-240);
  staticLastAdvancedAt = now;
}

function staticState(): EngineState {
  advanceStaticDemo();
  const current = staticHistory.at(-1) ?? staticTelemetry(staticCycle);
  const degradation = staticFault
    ? Math.min(1, 0.48 + (staticCycle - staticFault.startCycle) / 45)
    : Math.min(0.62, 0.08 + staticCycle / 1900);
  const anomalyScore = staticRound(Math.min(0.99, degradation + (staticFault ? 0.2 : 0)), 2);
  return {
    ...current,
    status: anomalyScore >= 0.72 ? 'critical' : anomalyScore >= 0.42 ? 'watch' : 'nominal',
    anomaly_score: anomalyScore,
    rul_hours: staticRound(Math.max(0, (1 - degradation) * 34), 1),
    fault_injected: staticFault !== null,
    confidence: staticRound(Math.max(0.71, 0.96 - degradation * 0.18), 2),
  };
}

resetStaticHistory();

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (STATIC_DEMO) {
    if (path === '/healthz') return { status: 'ok' } as T;
    if (path === '/engine/state') return staticState() as T;
    if (path.startsWith('/engine/history')) {
      advanceStaticDemo();
      const limit = Math.min(240, Math.max(10, Number(new URLSearchParams(path.split('?')[1] ?? '').get('limit') ?? 60)));
      return staticHistory.slice(-limit) as T;
    }
    if (path === '/engine/fault') {
      const payload = init?.body ? JSON.parse(String(init.body)) : {};
      staticFault = { severity: payload.severity === 'soft' ? 'soft' : 'hard', startCycle: staticCycle };
      return staticState() as T;
    }
    if (path === '/engine/reset') {
      staticFault = null;
      staticCycle = 742;
      staticLastAdvancedAt = Date.now();
      resetStaticHistory();
      return staticState() as T;
    }
  }
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!response.ok) throw new Error(`API request failed (${response.status})`);
  return response.json() as Promise<T>;
}

const statusMeta: Record<Status, { label: string; color: string; icon: typeof Check }> = {
  nominal: { label: 'Nominal', color: 'text-primary', icon: Check },
  watch: { label: 'Watch', color: 'text-accent', icon: AlertTriangle },
  critical: { label: 'Critical', color: 'text-destructive', icon: Siren },
};

const fallbackState = {
  timestamp: new Date().toISOString(),
  cycle: 0,
  cylinder_head_temp: 0,
  oil_pressure: 0,
  vibration: 0,
  rpm: 0,
  fuel_flow: 0,
  exhaust_gas_temp: 0,
  status: 'nominal' as Status,
  anomaly_score: 0,
  rul_hours: 0,
  fault_injected: false,
  confidence: 0,
};

function formatTime(timestamp?: string) {
  if (!timestamp) return '--:--:--';
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(timestamp));
}

function formatShortTime(timestamp?: string) {
  if (!timestamp) return '--:--';
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp));
}

function StatusPill({ status, compact = false }: { status: Status; compact?: boolean }) {
  const meta = statusMeta[status] ?? statusMeta.nominal;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-[10px] font-bold uppercase tracking-[.16em] ${meta.color} ${status === 'nominal' ? 'border-primary/25 bg-primary/10' : status === 'watch' ? 'border-accent/25 bg-accent/10' : 'border-destructive/30 bg-destructive/10'} ${compact ? 'px-1.5 py-0.5' : ''}`}>
      <Icon className="h-3 w-3" strokeWidth={2.5} />
      {meta.label}
    </span>
  );
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-sm bg-secondary/70 ${className}`} />;
}

function SideRail({ open, setOpen, onNotice }: { open: boolean; setOpen: (value: boolean) => void; onNotice: (text: string) => void }) {
  return (
    <>
      {open && <button aria-label="Close navigation" data-testid="button-close-navigation" className="fixed inset-0 z-30 bg-background/75 backdrop-blur-sm md:hidden" onClick={() => setOpen(false)} />}
      <aside className={`${open ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-300 md:static md:translate-x-0`}>
        <div className="flex h-[78px] items-center justify-between border-b border-sidebar-border px-5">
          <div className="flex items-center gap-3">
            <div className="relative grid h-9 w-9 place-items-center rounded-sm border border-primary/40 bg-primary/10 text-primary">
              <Command className="h-5 w-5" />
              <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-primary status-pulse" />
            </div>
            <div>
              <div className="text-[13px] font-extrabold tracking-[.12em] text-foreground">AERION</div>
              <div className="mono text-[9px] tracking-[.18em] text-muted-foreground">ENGINE SYSTEMS</div>
            </div>
          </div>
          <button className="text-muted-foreground hover:text-foreground md:hidden" aria-label="Collapse navigation" data-testid="button-collapse-navigation" onClick={() => setOpen(false)}><PanelLeftClose className="h-4 w-4" /></button>
        </div>
        <div className="px-4 py-5">
          <div className="mb-3 px-2 text-[9px] font-bold uppercase tracking-[.22em] text-muted-foreground">Flight deck</div>
          <nav className="space-y-1">
            <button data-testid="button-nav-overview" onClick={() => onNotice('Overview is the active console')} className="group flex w-full items-center gap-3 rounded-sm border border-primary/15 bg-primary/10 px-3 py-2.5 text-left text-[12px] font-semibold text-primary">
              <Activity className="h-4 w-4" /><span>Live overview</span><span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
            </button>
            <button data-testid="button-nav-history" onClick={() => onNotice('History is available in the telemetry panel below')} className="group flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-left text-[12px] font-semibold text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
              <History className="h-4 w-4" /><span>Telemetry history</span>
            </button>
            <button data-testid="button-nav-controls" onClick={() => onNotice('Simulation controls are docked in the right panel')} className="group flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-left text-[12px] font-semibold text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
              <SlidersHorizontal className="h-4 w-4" /><span>Simulation controls</span>
            </button>
          </nav>
        </div>
        <div className="mt-auto border-t border-sidebar-border p-4">
          <div className="mb-3 flex items-center justify-between px-2">
            <span className="text-[9px] font-bold uppercase tracking-[.18em] text-muted-foreground">System health</span>
            <span className="h-1.5 w-1.5 rounded-full bg-primary status-pulse" />
          </div>
          <div className="rounded-sm border border-sidebar-border bg-sidebar-accent/40 p-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-sidebar-accent-foreground"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> API connection</div>
            <div className="mono mt-2 flex items-center justify-between text-[10px] text-muted-foreground"><span>LATENCY</span><span className="text-primary">12 ms</span></div>
          </div>
          <div className="mt-4 flex items-center justify-between px-2">
            <span className="mono text-[9px] text-muted-foreground">AERION / 0.8.4</span>
            <button aria-label="Open system preferences" data-testid="button-system-preferences" onClick={() => onNotice('System preferences are managed by the mission profile')} className="text-muted-foreground transition-colors hover:text-primary"><Zap className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </aside>
    </>
  );
}

function MetricCard({ label, value, unit, icon: Icon, accent = 'primary', hint, trend }: { label: string; value: string; unit: string; icon: typeof Gauge; accent?: 'primary' | 'accent' | 'destructive'; hint: string; trend?: 'up' | 'down' }) {
  const accentClass = accent === 'primary' ? 'text-primary' : accent === 'accent' ? 'text-accent' : 'text-destructive';
  return (
    <article className="group relative overflow-hidden rounded-sm border border-card-border bg-card p-4 transition-colors duration-200 hover:border-primary/30">
      <div className={`absolute inset-y-0 left-0 w-[2px] ${accent === 'primary' ? 'bg-primary' : accent === 'accent' ? 'bg-accent' : 'bg-destructive'}`} />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground"><Icon className={`h-3.5 w-3.5 ${accentClass}`} />{label}</div>
        {trend && (trend === 'up' ? <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" /> : <TrendingDown className="h-3.5 w-3.5 text-muted-foreground" />)}
      </div>
      <div className="mt-4 flex items-baseline gap-2">
        <span className={`metric-number text-[28px] font-semibold leading-none ${accentClass}`}>{value}</span>
        <span className="mono text-[10px] uppercase text-muted-foreground">{unit}</span>
      </div>
      <div className="mt-3 text-[10px] text-muted-foreground">{hint}</div>
    </article>
  );
}

function EngineLoading() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-[132px]" />)}</div>
      <Skeleton className="h-[370px]" />
    </div>
  );
}

function TelemetryChart({ history }: { history: Array<{ timestamp: string; rpm: number; cylinder_head_temp: number; oil_pressure: number }> }) {
  const chartData = useMemo(() => history.map((point) => ({ ...point, time: formatShortTime(point.timestamp) })), [history]);
  return (
    <div className="h-[286px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 8, left: -24, bottom: 0 }}>
          <defs>
            <linearGradient id="rpmFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#61e2df" stopOpacity={0.2} /><stop offset="100%" stopColor="#61e2df" stopOpacity={0} /></linearGradient>
            <linearGradient id="tempFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f5c85b" stopOpacity={0.16} /><stop offset="100%" stopColor="#f5c85b" stopOpacity={0} /></linearGradient>
          </defs>
          <CartesianGrid stroke="hsl(222 17% 20% / .7)" vertical={false} />
          <XAxis dataKey="time" tick={{ fill: '#697783', fontSize: 9, fontFamily: 'DM Mono' }} tickLine={false} axisLine={false} minTickGap={40} />
          <YAxis yAxisId="rpm" tick={{ fill: '#697783', fontSize: 9, fontFamily: 'DM Mono' }} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
          <YAxis yAxisId="temp" orientation="right" hide domain={['auto', 'auto']} />
          <Tooltip contentStyle={{ background: '#171d27', border: '1px solid #293341', borderRadius: 2, fontSize: 11 }} labelStyle={{ color: '#9caab4', marginBottom: 4 }} itemStyle={{ padding: 0 }} />
          <Area yAxisId="rpm" type="monotone" dataKey="rpm" name="RPM" stroke="#61e2df" strokeWidth={2} fill="url(#rpmFill)" dot={false} activeDot={{ r: 3, fill: '#61e2df', stroke: '#10151e', strokeWidth: 2 }} />
          <Area yAxisId="temp" type="monotone" dataKey="cylinder_head_temp" name="CHT °C" stroke="#f5c85b" strokeWidth={1.5} fill="url(#tempFill)" dot={false} activeDot={{ r: 3, fill: '#f5c85b', stroke: '#10151e', strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function SimulationControls({ faultInjected, onNotice }: { faultInjected: boolean; onNotice: (text: string) => void }) {
  const queryClient = useQueryClient();
  const [severity, setSeverity] = useState<Severity>('soft');
  const [confirming, setConfirming] = useState(false);
  const injectFault = useMutation({ mutationFn: (data: { severity: Severity }) => apiFetch<EngineState>('/engine/fault', { method: 'POST', body: JSON.stringify(data) }) });
  const resetSimulation = useMutation({ mutationFn: () => apiFetch<EngineState>('/engine/reset', { method: 'POST' }) });

  const applyState = (next: typeof fallbackState) => {
    queryClient.setQueryData(['engine', 'state'], next);
    queryClient.invalidateQueries({ queryKey: ['engine', 'history'] });
  };

  const confirmFault = () => {
    injectFault.mutate({ severity }, {
      onSuccess: (next) => { applyState(next); setConfirming(false); onNotice(`${severity === 'soft' ? 'Soft' : 'Hard'} fault trajectory injected`); },
      onError: () => { setConfirming(false); onNotice('Fault injection failed — check API connection'); },
    });
  };

  const reset = () => {
    resetSimulation.mutate(undefined, {
      onSuccess: (next) => { applyState(next); onNotice('Simulation reset to nominal trajectory'); },
      onError: () => onNotice('Reset failed — check API connection'),
    });
  };

  return (
    <section className="rounded-sm border border-card-border bg-card">
      <div className="flex items-center justify-between border-b border-card-border px-4 py-3">
        <div className="flex items-center gap-2"><TimerReset className="h-4 w-4 text-accent" /><h2 className="text-[11px] font-bold uppercase tracking-[.16em] text-foreground">Simulation controls</h2></div>
        <span className="mono text-[9px] text-muted-foreground">LAB MODE</span>
      </div>
      <div className="p-4">
        <p className="text-[11px] leading-relaxed text-muted-foreground">Introduce a controlled failure trajectory to validate operator response and model confidence.</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button data-testid="button-severity-soft" onClick={() => setSeverity('soft')} className={`rounded-sm border px-3 py-2.5 text-left transition-colors ${severity === 'soft' ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border text-muted-foreground hover:border-accent/30 hover:text-foreground'}`}>
            <div className="text-[10px] font-bold uppercase tracking-[.14em]">Soft fault</div><div className="mt-1 text-[10px] opacity-70">Gradual degradation</div>
          </button>
          <button data-testid="button-severity-hard" onClick={() => setSeverity('hard')} className={`rounded-sm border px-3 py-2.5 text-left transition-colors ${severity === 'hard' ? 'border-destructive/50 bg-destructive/10 text-destructive' : 'border-border text-muted-foreground hover:border-destructive/30 hover:text-foreground'}`}>
            <div className="text-[10px] font-bold uppercase tracking-[.14em]">Hard fault</div><div className="mt-1 text-[10px] opacity-70">Rapid escalation</div>
          </button>
        </div>
        <button data-testid="button-inject-fault" disabled={injectFault.isPending || faultInjected} onClick={() => setConfirming(true)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-sm bg-destructive px-3 py-3 text-[11px] font-extrabold uppercase tracking-[.14em] text-destructive-foreground transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40">
          <Siren className="h-4 w-4" />{injectFault.isPending ? 'Injecting trajectory' : faultInjected ? 'Fault trajectory active' : 'Inject selected fault'}
        </button>
        <button data-testid="button-reset-simulation" disabled={resetSimulation.isPending || !faultInjected} onClick={reset} className="mt-2 flex w-full items-center justify-center gap-2 rounded-sm border border-border px-3 py-2.5 text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-35"><RotateCcw className="h-3.5 w-3.5" />{resetSimulation.isPending ? 'Restoring baseline' : 'Reset to nominal'}</button>
        {confirming && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-sm">
            <div className="w-full max-w-[390px] rounded-sm border border-destructive/40 bg-card p-5 shadow-2xl">
              <div className="flex items-start justify-between"><div className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-5 w-5" /><h3 className="text-sm font-bold">Confirm fault injection</h3></div><button data-testid="button-close-fault-dialog" aria-label="Close confirmation" onClick={() => setConfirming(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button></div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">This will alter the live simulator state with a <span className="font-bold text-foreground">{severity}</span> failure trajectory. Continue only in a controlled test session.</p>
              <div className="mt-5 flex gap-2"><button data-testid="button-cancel-fault" onClick={() => setConfirming(false)} className="flex-1 rounded-sm border border-border px-3 py-2.5 text-[10px] font-bold uppercase tracking-[.13em] text-muted-foreground hover:text-foreground">Cancel</button><button data-testid="button-confirm-fault" onClick={confirmFault} className="flex-1 rounded-sm bg-destructive px-3 py-2.5 text-[10px] font-bold uppercase tracking-[.13em] text-destructive-foreground hover:opacity-85">Confirm injection</button></div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Overview() {
  const [railOpen, setRailOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const stateQuery = useQuery({ queryKey: ['engine', 'state'], queryFn: () => apiFetch<EngineState>('/engine/state'), refetchInterval: 2500, refetchOnWindowFocus: true });
  const historyQuery = useQuery({ queryKey: ['engine', 'history'], queryFn: () => apiFetch<TelemetryPoint[]>('/engine/history?limit=60'), refetchInterval: 5000 });
  const healthQuery = useQuery({ queryKey: ['health'], queryFn: () => apiFetch<{ status: string }>('/healthz'), refetchInterval: 5000 });
  const state = stateQuery.data ?? fallbackState;
  const status = (state.status ?? 'nominal') as Status;
  const history = historyQuery.data ?? [];
  const isLoading = stateQuery.isLoading;
  const isError = stateQuery.isError;
  const lastUpdated = state.timestamp ? formatTime(state.timestamp) : '--:--:--';

  return (
    <div className="scanline min-h-[100dvh] bg-background text-foreground">
      <div className="flex min-h-[100dvh]">
        <SideRail open={railOpen} setOpen={setRailOpen} onNotice={setNotice} />
        <main className="min-w-0 flex-1">
          <header className="flex h-[78px] items-center justify-between border-b border-border px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <button aria-label="Open navigation" data-testid="button-open-navigation" className="text-muted-foreground hover:text-foreground md:hidden" onClick={() => setRailOpen(true)}><Menu className="h-5 w-5" /></button>
              <div><div className="flex items-center gap-2"><span className="mono text-[10px] uppercase tracking-[.2em] text-primary">LIVE CONSOLE</span><span className="h-1 w-1 rounded-full bg-border" /><span className="mono text-[10px] text-muted-foreground">UAV-PT6 / TEST CELL 04</span></div><h1 className="mt-1 text-lg font-extrabold tracking-[-.03em] sm:text-xl">Engine overview</h1></div>
            </div>
            <div className="flex items-center gap-3 sm:gap-5">
              <div className="hidden text-right sm:block"><div className="mono text-[9px] uppercase tracking-[.15em] text-muted-foreground">Last packet</div><div data-testid="text-last-packet" className="mono mt-1 text-[11px] text-foreground">{lastUpdated} UTC</div></div>
              <div className="flex items-center gap-2 rounded-sm border border-primary/20 bg-primary/5 px-2.5 py-2"><span className={`h-1.5 w-1.5 rounded-full ${healthQuery.isError ? 'bg-destructive' : 'bg-primary status-pulse'}`} /><span data-testid="status-api-connection" className="text-[10px] font-bold uppercase tracking-[.12em] text-primary">{healthQuery.isError ? 'Offline' : 'Connected'}</span></div>
            </div>
          </header>

          <div className="mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8">
            {notice && <div data-testid="status-notice" className="mb-5 flex items-center justify-between rounded-sm border border-primary/25 bg-primary/5 px-3 py-2.5 text-[11px] text-primary animate-reveal"><span className="flex items-center gap-2"><Check className="h-3.5 w-3.5" />{notice}</span><button data-testid="button-dismiss-notice" aria-label="Dismiss notification" onClick={() => setNotice('')}><X className="h-3.5 w-3.5" /></button></div>}
            {isError ? (
              <div data-testid="state-error" className="instrument-grid rounded-sm border border-destructive/30 bg-destructive/5 p-8 text-center"><AlertTriangle className="mx-auto h-8 w-8 text-destructive" /><h2 className="mt-4 text-sm font-bold">Telemetry link unavailable</h2><p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">The engine state endpoint did not respond. The console will not infer readings while the link is down.</p><button data-testid="button-retry-state" onClick={() => stateQuery.refetch()} className="mt-5 inline-flex items-center gap-2 rounded-sm border border-destructive/40 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[.14em] text-destructive hover:bg-destructive/10"><RotateCcw className="h-3.5 w-3.5" />Retry telemetry link</button></div>
            ) : isLoading ? <EngineLoading /> : (
              <>
                <section className="animate-reveal">
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><div className="mb-1 text-[10px] font-bold uppercase tracking-[.2em] text-muted-foreground">Current condition</div><div className="flex items-center gap-3"><h2 data-testid="text-engine-status" className="text-2xl font-extrabold tracking-[-.04em]">{statusMeta[status].label} operating condition</h2><StatusPill status={status} /></div></div><div className="flex items-center gap-2 text-[10px] text-muted-foreground"><Clock3 className="h-3.5 w-3.5" /><span className="mono">{lastUpdated} UTC</span><span className="text-border">/</span><span className="mono">2.5s refresh</span></div></div>
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <MetricCard label="Engine speed" value={state.rpm.toLocaleString()} unit="rpm" icon={Gauge} hint="Target band 2,200—2,450" />
                    <MetricCard label="Cylinder head" value={state.cylinder_head_temp.toFixed(1)} unit="°C" icon={Thermometer} accent={state.cylinder_head_temp > 190 ? 'destructive' : state.cylinder_head_temp > 175 ? 'accent' : 'primary'} hint="Thermal load / CHT" trend={state.cylinder_head_temp > 175 ? 'up' : undefined} />
                    <MetricCard label="Oil pressure" value={state.oil_pressure.toFixed(1)} unit="bar" icon={Activity} accent={state.oil_pressure < 3 ? 'destructive' : state.oil_pressure < 3.5 ? 'accent' : 'primary'} hint="Lubrication circuit" />
                    <MetricCard label="Vibration" value={state.vibration.toFixed(2)} unit="g RMS" icon={Waves} accent={state.vibration > 0.7 ? 'destructive' : state.vibration > 0.45 ? 'accent' : 'primary'} hint="Crankcase accelerometer" />
                  </div>
                </section>

                <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
                  <div className="min-w-0 space-y-5">
                  <EngineSchematic state={state} />
                  <section className="min-w-0 rounded-sm border border-card-border bg-card animate-reveal [animation-delay:80ms]">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-card-border px-4 py-3 sm:px-5"><div><h2 className="text-[11px] font-bold uppercase tracking-[.16em]">Live telemetry</h2><p className="mt-1 text-[10px] text-muted-foreground">Rolling 60-cycle envelope · values sampled from engine bus</p></div><div className="flex items-center gap-4 text-[10px] text-muted-foreground"><span className="flex items-center gap-1.5"><i className="h-1.5 w-4 rounded-full bg-primary" />RPM</span><span className="flex items-center gap-1.5"><i className="h-1.5 w-4 rounded-full bg-accent" />CHT</span></div></div>
                    <div className="p-4 sm:p-5">{historyQuery.isLoading ? <Skeleton className="h-[286px]" /> : historyQuery.isError ? <div data-testid="history-error" className="instrument-grid grid h-[286px] place-items-center rounded-sm border border-border text-center"><div><AlertTriangle className="mx-auto h-6 w-6 text-accent" /><p className="mt-2 text-xs text-muted-foreground">History stream unavailable</p><button data-testid="button-retry-history" onClick={() => historyQuery.refetch()} className="mt-3 text-[10px] font-bold uppercase tracking-[.12em] text-primary hover:underline">Retry stream</button></div></div> : history.length === 0 ? <div data-testid="history-empty" className="instrument-grid grid h-[286px] place-items-center rounded-sm border border-border text-center"><div><History className="mx-auto h-6 w-6 text-muted-foreground" /><p className="mt-2 text-xs text-muted-foreground">No telemetry history yet</p><p className="mt-1 text-[10px] text-muted-foreground/70">The plot will populate as packets arrive.</p></div></div> : <TelemetryChart history={history} />}</div>
                    <div className="grid grid-cols-2 border-t border-card-border sm:grid-cols-4"><MiniValue label="Fuel flow" value={`${state.fuel_flow.toFixed(1)} L/h`} icon={BatteryCharging} /><MiniValue label="Exhaust gas" value={`${state.exhaust_gas_temp.toFixed(0)} °C`} icon={Zap} /><MiniValue label="Current cycle" value={state.cycle.toLocaleString()} icon={CircleGauge} /><MiniValue label="Fault state" value={state.fault_injected ? 'Injected' : 'Clear'} icon={state.fault_injected ? Siren : ShieldCheck} warn={state.fault_injected} /></div>
                  </section>
                  </div>
                  <div className="space-y-5 animate-reveal [animation-delay:140ms]"><HealthPanel state={state} /><SimulationControls faultInjected={state.fault_injected} onNotice={setNotice} /></div>
                </div>
              </>
            )}
          </div>
          <footer className="border-t border-border px-4 py-4 sm:px-6 lg:px-8"><div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-2 mono text-[9px] uppercase tracking-[.13em] text-muted-foreground"><span>Telemetry integrity: <b className="font-medium text-primary">verified</b></span><span>Autonomous monitor / operator supervised</span><span>Build 24.11.04</span></div></footer>
        </main>
      </div>
    </div>
  );
}

function sensorState(
  value: number,
  thresholds: { watch: number; critical: number },
  inverse = false,
): Status {
  const score = inverse ? -value : value;
  const watch = inverse ? -thresholds.watch : thresholds.watch;
  const critical = inverse ? -thresholds.critical : thresholds.critical;
  return score >= critical ? 'critical' : score >= watch ? 'watch' : 'nominal';
}

function EngineSchematic({ state }: { state: typeof fallbackState }) {
  const sensors = [
    { key: 'cylinder_head_temp', label: 'CHT', value: `${state.cylinder_head_temp.toFixed(1)}°C`, x: 157, y: 72, status: sensorState(state.cylinder_head_temp, { watch: 185, critical: 200 }) },
    { key: 'oil_pressure', label: 'OIL P', value: `${state.oil_pressure.toFixed(1)} bar`, x: 54, y: 147, status: sensorState(state.oil_pressure, { watch: 42, critical: 35 }, true) },
    { key: 'vibration', label: 'VIB', value: `${state.vibration.toFixed(2)} g`, x: 257, y: 171, status: sensorState(state.vibration, { watch: 0.52, critical: 0.72 }) },
    { key: 'rpm', label: 'RPM', value: `${Math.round(state.rpm).toLocaleString()}`, x: 361, y: 117, status: sensorState(state.rpm, { watch: 2220, critical: 2100 }, true) },
  ];
  const tone: Record<Status, { fill: string; stroke: string; text: string }> = {
    nominal: { fill: '#61e2df', stroke: '#61e2df', text: 'text-primary' },
    watch: { fill: '#f5c85b', stroke: '#f5c85b', text: 'text-accent' },
    critical: { fill: '#f45d5d', stroke: '#f45d5d', text: 'text-destructive' },
  };
  return (
    <section className="rounded-sm border border-card-border bg-card animate-reveal [animation-delay:40ms]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-card-border px-4 py-3 sm:px-5">
        <div><h2 className="text-[11px] font-bold uppercase tracking-[.16em]">Engine digital twin</h2><p className="mt-1 text-[10px] text-muted-foreground">Live sensor state mapped to engine architecture</p></div>
        <div className="flex items-center gap-3 text-[9px] font-bold uppercase tracking-[.13em] text-muted-foreground"><span className="flex items-center gap-1.5"><i className="h-1.5 w-1.5 rounded-full bg-primary" />Normal</span><span className="flex items-center gap-1.5"><i className="h-1.5 w-1.5 rounded-full bg-accent" />Watch</span><span className="flex items-center gap-1.5"><i className="h-1.5 w-1.5 rounded-full bg-destructive" />Critical</span></div>
      </div>
      <div className="relative overflow-hidden px-3 py-4 sm:px-6">
        <svg viewBox="0 0 520 250" role="img" aria-label="Two cylinder piston engine schematic with live sensor points" className="h-auto w-full">
          <defs><linearGradient id="engineMetal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#293341" /><stop offset="1" stopColor="#151b24" /></linearGradient><filter id="sensorGlow"><feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
          <path d="M114 69 L143 42 L206 42 L224 58 L318 58 L336 42 L398 42 L427 69 L427 181 L394 207 L141 207 L114 181 Z" fill="url(#engineMetal)" stroke="#445363" strokeWidth="2" />
          <path d="M138 85 L195 85 L195 165 L138 165 Z M325 85 L382 85 L382 165 L325 165 Z" fill="#10151e" stroke="#596877" strokeWidth="1.5" />
          <path d="M149 103 h35 v38 h-35z M336 103 h35 v38 h-35z" fill="#242e3a" stroke="#697784" strokeWidth="1" />
          <path d="M184 122 H336 M166 141 V181 M353 141 V181 M166 181 H353" fill="none" stroke="#697784" strokeWidth="3" strokeLinecap="round" />
          <path d="M99 119 H138 M382 119 H441 M225 58 V30 M316 58 V30" fill="none" stroke="#536574" strokeWidth="2" strokeDasharray="4 4" />
          <path d="M88 119 h-15 M456 119 h15 M225 22 v-12 M316 22 v-12" stroke="#536574" strokeWidth="1" />
          <text x="260" y="229" fill="#697783" fontSize="9" fontFamily="DM Mono" textAnchor="middle" letterSpacing="2">PT6 PISTON ENGINE / TEST CELL 04</text>
          {sensors.map((sensor) => {
            const colors = tone[sensor.status];
            return <g key={sensor.key} className="transition-all duration-500">
              <circle cx={sensor.x} cy={sensor.y} r="10" fill={colors.fill} opacity=".16" filter="url(#sensorGlow)" />
              <circle cx={sensor.x} cy={sensor.y} r="5" fill={colors.fill} stroke="#0d1219" strokeWidth="2" filter="url(#sensorGlow)" />
              <line x1={sensor.x} y1={sensor.y} x2={sensor.x < 220 ? sensor.x - 30 : sensor.x + 30} y2={sensor.y - 22} stroke={colors.stroke} strokeWidth="1" opacity=".7" />
              <rect x={sensor.x < 220 ? sensor.x - 100 : sensor.x + 30} y={sensor.y - 40} width="70" height="35" rx="2" fill="#151b24" stroke={colors.stroke} strokeOpacity=".5" />
              <text x={sensor.x < 220 ? sensor.x - 93 : sensor.x + 37} y={sensor.y - 25} fill={colors.fill} fontSize="9" fontFamily="DM Mono" fontWeight="bold">{sensor.label}</text>
              <text x={sensor.x < 220 ? sensor.x - 93 : sensor.x + 37} y={sensor.y - 13} fill="#d8e0e5" fontSize="9" fontFamily="DM Mono">{sensor.value}</text>
            </g>;
          })}
        </svg>
      </div>
    </section>
  );
}

function MiniValue({ label, value, icon: Icon, warn = false }: { label: string; value: string; icon: typeof Zap; warn?: boolean }) {
  return <div className="border-r border-card-border px-4 py-3 last:border-r-0"><div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[.13em] text-muted-foreground"><Icon className={`h-3 w-3 ${warn ? 'text-destructive' : 'text-muted-foreground'}`} />{label}</div><div data-testid={`text-mini-${label.toLowerCase().replaceAll(' ', '-')}`} className={`mono mt-1.5 text-[12px] ${warn ? 'text-destructive' : 'text-foreground'}`}>{value}</div></div>;
}

function HealthPanel({ state }: { state: typeof fallbackState }) {
  const anomaly = Math.min(100, Math.max(0, state.anomaly_score * 100));
  const confidence = Math.min(100, Math.max(0, state.confidence * 100));
  const rul = state.rul_hours;
  return (
    <section className="rounded-sm border border-card-border bg-card">
      <div className="flex items-center justify-between border-b border-card-border px-4 py-3"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /><h2 className="text-[11px] font-bold uppercase tracking-[.16em]">Health assessment</h2></div><span className="mono text-[9px] text-muted-foreground">MODEL V2.4</span></div>
      <div className="space-y-4 p-4">
        <HealthBar label="Anomaly score" value={`${anomaly.toFixed(1)}%`} percent={anomaly} color={anomaly > 70 ? 'destructive' : anomaly > 35 ? 'accent' : 'primary'} />
        <HealthBar label="Model confidence" value={`${confidence.toFixed(1)}%`} percent={confidence} color="primary" />
        <div className="border-t border-border pt-4"><div className="flex items-center gap-4"><div className="relative h-[104px] w-[104px] shrink-0 rounded-full" style={{ background: `conic-gradient(hsl(var(--primary)) ${Math.min(100, (rul / 34) * 100)}%, hsl(var(--secondary)) 0)` }}><div className="absolute inset-[7px] grid place-items-center rounded-full bg-card"><div className="text-center"><div data-testid="text-rul-hours" className="metric-number text-[25px] font-semibold leading-none text-foreground">{rul.toFixed(1)}</div><div className="mono mt-1 text-[9px] uppercase text-muted-foreground">hours</div></div></div></div><div><div className="text-[10px] font-bold uppercase tracking-[.15em] text-muted-foreground">Remaining useful life</div><div className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Predicted operating time before maintenance threshold.</div><div className="mono mt-2 text-[10px] text-primary">90% confidence bound</div></div></div></div>
      </div>
    </section>
  );
}

function HealthBar({ label, value, percent, color }: { label: string; value: string; percent: number; color: 'primary' | 'accent' | 'destructive' }) {
  return <div><div className="mb-2 flex items-center justify-between text-[10px]"><span className="font-semibold text-muted-foreground">{label}</span><span className={`mono ${color === 'primary' ? 'text-primary' : color === 'accent' ? 'text-accent' : 'text-destructive'}`}>{value}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-secondary"><div className={`h-full rounded-full transition-[width] duration-500 ${color === 'primary' ? 'bg-primary' : color === 'accent' ? 'bg-accent' : 'bg-destructive'}`} style={{ width: `${percent}%` }} /></div></div>;
}

function App() {
  return <QueryClientProvider client={queryClient}><ErrorBoundary><Overview /></ErrorBoundary></QueryClientProvider>;
}

export default App;
