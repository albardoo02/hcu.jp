import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, House, Power, RefreshCw } from "lucide-react";
import { api, type Dashboard as Data, type DeviceInfo, type Me, type StatusMap } from "../api";
import { Header } from "../components/Header";
import { Icon } from "../components/Icon";
import { CommandPalette, type Entry } from "../components/CommandPalette";

export function Dashboard({ me }: { me: Me }) {
  const [data, setData] = useState<Data | null>(null);
  const [status, setStatus] = useState<StatusMap>({});
  const [checking, setChecking] = useState(false);
  const [palette, setPalette] = useState(false);
  const [toast, setToast] = useState("");

  async function refreshStatus() {
    setChecking(true);
    try { setStatus(await api<StatusMap>("/api/status")); } finally { setChecking(false); }
  }

  useEffect(() => {
    api<Data>("/api/dashboard").then(setData);
    refreshStatus();
    const t = setInterval(refreshStatus, 30_000);
    return () => clearInterval(t);
  }, []);

  const entries = useMemo<Entry[]>(() => {
    if (!data) return [];
    return [
      ...data.devices.map((d) => ({
        id: d.id, title: d.name, subtitle: d.url ? new URL(d.url).host : d.lan, icon: d.icon,
        href: d.url ?? d.lan, group: "Home Lab",
      })),
      ...data.links.flatMap((g) => g.items.map((l) => ({
        id: l.url, title: l.name, subtitle: new URL(l.url).host, icon: l.icon, href: l.url, group: g.group,
      }))),
    ];
  }, [data]);

  // ショートカット: Ctrl/⌘+K でパレット, 1〜9 でデバイスを開く
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((v) => !v); return; }
      const tag = (e.target as HTMLElement).tagName;
      if (palette || tag === "INPUT" || tag === "TEXTAREA" || e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      const d = data?.devices[n - 1];
      if (n >= 1 && n <= 9 && d) window.open(d.url ?? d.lan, "_blank", "noopener");
    };
    addEventListener("keydown", on);
    return () => removeEventListener("keydown", on);
  }, [data, palette]);

  async function wake(d: DeviceInfo) {
    try {
      await api(`/api/devices/${d.id}/wake`, {});
      setToast(`${d.name} にマジックパケットを送信しました`);
    } catch {
      setToast("送信に失敗しました");
    }
    setTimeout(() => setToast(""), 3500);
  }

  const online = data?.devices.filter((d) => status[d.id]?.up).length ?? 0;

  return (
    <>
      <Header me={me} onSearch={() => setPalette(true)} />
      <main className="mx-auto max-w-6xl px-5 pb-24 pt-10 sm:pt-14">
        <Hero name={me.username} online={online} total={data?.devices.length ?? 0} />

        <section className="mt-12">
          <SectionTitle icon={<House className="size-4" />} title="Home Lab" sub="自宅のデバイスにワンクリックで接続">
            <button onClick={refreshStatus} className="btn-ghost px-3 py-1.5 text-xs" disabled={checking}>
              <RefreshCw className={`size-3.5 ${checking ? "animate-spin" : ""}`} /> 再確認
            </button>
          </SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data?.devices.map((d, i) => (
              <DeviceCard key={d.id} d={d} index={i} st={status[d.id]} onWake={() => wake(d)} />
            )) ?? Array.from({ length: 3 }, (_, i) => <div key={i} className="card h-48 animate-pulse" />)}
          </div>
        </section>

        {data?.links.map((g) => (
          <section key={g.group} className="mt-14">
            <SectionTitle title={g.group} />
            <div className="grid gap-3 sm:grid-cols-2">
              {g.items.map((l) => (
                <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer"
                  className="card card-hover group flex items-center gap-4 p-4">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.08] to-transparent">
                    <Icon name={l.icon} className="size-5 text-cyan-300" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-semibold text-white">{l.name}</span>
                      {l.status && <StatusBadge s={l.status} />}
                    </span>
                    {l.description && <span className="mt-0.5 block truncate text-sm text-zinc-500">{l.description}</span>}
                  </span>
                  <ArrowUpRight className="size-5 shrink-0 text-zinc-600 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white" />
                </a>
              ))}
            </div>
          </section>
        ))}
      </main>

      <footer className="border-t border-white/5 py-8 text-center text-xs text-zinc-600">
        hcu.jp · <span className="kbd">1</span>–<span className="kbd">9</span> でデバイスを開く ·{" "}
        <span className="kbd">Ctrl K</span> で検索
      </footer>

      <CommandPalette entries={entries} open={palette} onClose={() => setPalette(false)} />

      {toast && (
        <div className="card rise fixed bottom-6 left-1/2 z-50 -translate-x-1/2 bg-ink-800/95 px-5 py-3 text-sm text-white shadow-2xl">
          {toast}
        </div>
      )}
    </>
  );
}

function Hero({ name, online, total }: { name: string; online: number; total: number }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const h = now.getHours();
  const greet = h < 5 ? "こんばんは" : h < 11 ? "おはようございます" : h < 18 ? "こんにちは" : "こんばんは";

  return (
    <section className="rise flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="font-mono text-sm text-zinc-500">
          {now.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" })}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-5xl">
          {greet}、<span className="text-gradient">{name}</span>
        </h1>
      </div>
      <div className="flex items-center gap-6">
        <div className="text-right">
          <p className="font-mono text-3xl font-medium tabular-nums text-white sm:text-4xl">
            {now.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
            <span className="text-zinc-600">:{String(now.getSeconds()).padStart(2, "0")}</span>
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            <span className={online === total && total > 0 ? "text-emerald-400" : "text-amber-300"}>{online}</span>
            {" / "}{total} 台オンライン
          </p>
        </div>
      </div>
    </section>
  );
}

function SectionTitle({ title, sub, icon, children }: { title: string; sub?: string; icon?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-zinc-400">
          {icon}{title}
        </h2>
        {sub && <p className="mt-1 text-sm text-zinc-600">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

function DeviceCard({ d, index, st, onWake }: { d: DeviceInfo; index: number; st?: { up: boolean; ms: number | null }; onWake: () => void }) {
  const href = d.url ?? d.lan;
  const state = st === undefined ? "checking" : st.up ? "up" : "down";
  return (
    <article className="card card-hover rise group relative flex flex-col overflow-hidden p-5" style={{ animationDelay: `${index * 50}ms` }}>
      <div className={`pointer-events-none absolute -right-16 -top-16 size-40 rounded-full blur-3xl transition-opacity ${state === "up" ? "bg-emerald-500/10 opacity-100" : "opacity-0"}`} />
      <div className="flex items-start justify-between">
        <span className="grid size-12 place-items-center rounded-xl border border-white/10 bg-gradient-to-br from-violet-500/20 to-cyan-500/10">
          <Icon name={d.icon} className="size-6 text-violet-200" />
        </span>
        <StatusPill state={state} ms={st?.ms ?? null} />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-white">{d.name}</h3>
      <p className="mt-0.5 line-clamp-2 text-sm text-zinc-500">{d.description}</p>
      <p className="mt-3 truncate font-mono text-xs text-zinc-600">{d.url ? new URL(d.url).host : d.lan}</p>

      <div className="mt-5 flex items-center gap-2">
        <a href={href} target="_blank" rel="noopener" className="btn-primary flex-1 py-2">
          開く <ArrowUpRight className="size-4" />
        </a>
        {d.url && (
          <a href={d.lan} target="_blank" rel="noopener" className="btn-ghost px-3 py-2" title={`LAN 内から直接開く (${d.lan})`}>
            LAN
          </a>
        )}
        {d.wol && (
          <button onClick={onWake} className="btn-ghost px-3 py-2" title="Wake-on-LAN で起動">
            <Power className="size-4" />
          </button>
        )}
      </div>
      {index < 9 && <span className="kbd absolute bottom-[4.6rem] right-5 opacity-0 transition group-hover:opacity-100">{index + 1}</span>}
    </article>
  );
}

function StatusPill({ state, ms }: { state: "checking" | "up" | "down"; ms: number | null }) {
  const cls = {
    checking: "border-white/10 text-zinc-400",
    up: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
    down: "border-rose-400/20 bg-rose-400/10 text-rose-300",
  }[state];
  const dot = { checking: "bg-zinc-500 animate-pulse", up: "bg-emerald-400", down: "bg-rose-400" }[state];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${cls}`}>
      <span className="relative flex size-2">
        {state === "up" && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
        <span className={`relative inline-flex size-2 rounded-full ${dot}`} />
      </span>
      {state === "checking" ? "確認中" : state === "up" ? `Online${ms != null ? ` · ${ms}ms` : ""}` : "Offline"}
    </span>
  );
}

function StatusBadge({ s }: { s: string }) {
  const c: Record<string, string> = {
    公開中: "bg-emerald-400/10 text-emerald-300 border-emerald-400/20",
    開発中: "bg-sky-400/10 text-sky-300 border-sky-400/20",
    公開準備中: "bg-violet-400/10 text-violet-300 border-violet-400/20",
    公開停止中: "bg-amber-400/10 text-amber-300 border-amber-400/20",
    アーカイブ: "bg-zinc-400/10 text-zinc-400 border-zinc-400/20",
  };
  return <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${c[s] ?? c["アーカイブ"]}`}>{s}</span>;
}
