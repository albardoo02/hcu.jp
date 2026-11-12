import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

/* ------------------------------------------------------------------ hooks */

/** 画面に入ったら true (アニメーション開始のトリガー) */
export function useInView<T extends Element>(threshold = 0.25) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [seen, threshold]);
  return [ref, seen] as const;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ------------------------------------------------------------------ CountUp */

export function CountUp({ value, start, duration = 1400 }: { value: number; start: boolean; duration?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!start) return;
    if (reduced()) { setN(value); return; }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      setN(Math.round(value * (1 - Math.pow(1 - p, 4))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, start, duration]);
  return <>{n.toLocaleString()}</>;
}

/* ------------------------------------------------------------------ Tooltip */

function Tip({ x, y, w, children }: { x: number; y: number; w: number; children: ReactNode }) {
  // 右端ではみ出さないよう左右を切り替え
  const flip = x > w - 150;
  return (
    <div className="pointer-events-none absolute z-10 whitespace-nowrap rounded-lg border border-white/10 bg-ink-900/95 px-3 py-2 text-xs shadow-xl shadow-black/50 backdrop-blur"
      style={{ left: x, top: y, transform: `translate(${flip ? "calc(-100% - 12px)" : "12px"}, -50%)` }}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ Area (週ごとのコントリビューション) */

/** 単調 3 次補間 (オーバーシュートしない) */
function monotonePath(pts: [number, number][]) {
  const n = pts.length;
  if (n < 2) return "";
  const dx = pts.slice(1).map((p, i) => p[0] - pts[i][0]);
  const m = pts.slice(1).map((p, i) => (p[1] - pts[i][1]) / dx[i]);
  const t = pts.map((_, i) => (i === 0 ? m[0] : i === n - 1 ? m[n - 2] : m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${pts[i][0] + h},${pts[i][1] + t[i] * h} ${pts[i + 1][0] - h},${pts[i + 1][1] - t[i + 1] * h} ${pts[i + 1][0]},${pts[i + 1][1]}`;
  }
  return d;
}

function niceMax(v: number) {
  if (v <= 4) return 4;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

export function ContributionArea({ days, height = 200 }: { days: { date: string; count: number }[]; height?: number }) {
  const [wrap, w] = useWidth<HTMLDivElement>();
  const [view, seen] = useInView<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const weeks = useMemo(() => {
    const out: { start: string; end: string; count: number }[] = [];
    for (let i = 0; i < days.length; i += 7) {
      const chunk = days.slice(i, i + 7);
      out.push({ start: chunk[0].date, end: chunk[chunk.length - 1].date, count: chunk.reduce((s, d) => s + d.count, 0) });
    }
    return out;
  }, [days]);

  const pad = { l: 8, r: 36, t: 12, b: 26 };
  const iw = Math.max(0, w - pad.l - pad.r), ih = height - pad.t - pad.b;
  const max = niceMax(Math.max(...weeks.map((x) => x.count), 1));
  const x = (i: number) => pad.l + (weeks.length > 1 ? (i / (weeks.length - 1)) * iw : 0);
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const pts = weeks.map((wk, i) => [x(i), y(wk.count)] as [number, number]);
  const line = monotonePath(pts);
  const area = line && `${line}L${x(weeks.length - 1)},${pad.t + ih}L${x(0)},${pad.t + ih}Z`;
  const ticks = [0, max / 2, max];
  const months = weeks.map((wk, i) => ({ i, d: new Date(wk.start) })).filter(({ d }, i, a) => i === 0 || d.getMonth() !== a[i - 1].d.getMonth()).filter((_, k) => k % 2 === 0);

  function onMove(e: React.PointerEvent) {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const px = e.clientX - r.left;
    setHover(Math.max(0, Math.min(weeks.length - 1, Math.round(((px - pad.l) / iw) * (weeks.length - 1)))));
  }

  const fmt = (s: string) => new Date(s).toLocaleDateString("ja-JP", { month: "short", day: "numeric" });

  return (
    <div ref={view} className="relative">
      <div ref={wrap} className="relative">
        {w > 0 && (
          <svg width={w} height={height} className="block touch-none" onPointerMove={onMove} onPointerLeave={() => setHover(null)}
            role="img" aria-label={`過去 1 年の週別コントリビューション。最大 ${Math.max(...weeks.map((x) => x.count))} / 週`}>
            <defs>
              <linearGradient id="area-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#a78bfa" stopOpacity="0.45" />
                <stop offset="1" stopColor="#a78bfa" stopOpacity="0" />
              </linearGradient>
              <clipPath id="area-reveal">
                <rect x="0" y="0" height={height} width={seen ? w : 0} style={{ transition: reduced() ? "none" : "width 1.6s cubic-bezier(.3,.7,.2,1)" }} />
              </clipPath>
            </defs>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={pad.l + iw} y1={y(t)} y2={y(t)} stroke="rgb(255 255 255 / .06)" strokeDasharray={t === 0 ? undefined : "2 4"} />
                <text x={pad.l + iw + 8} y={y(t)} dy="0.32em" className="fill-zinc-500 font-mono text-[10px]">{t}</text>
              </g>
            ))}
            {months.map(({ i, d }) => (
              <text key={i} x={x(i)} y={height - 6} className="fill-zinc-500 font-mono text-[10px]" textAnchor={i === 0 ? "start" : "middle"}>
                {`${String(d.getFullYear()).slice(2)}/${String(d.getMonth() + 1).padStart(2, "0")}`}
              </text>
            ))}
            <g clipPath="url(#area-reveal)">
              <path d={area} fill="url(#area-fill)" />
              <path d={line} fill="none" stroke="#a78bfa" strokeWidth={2} strokeLinejoin="round" />
            </g>
            {hover !== null && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="rgb(255 255 255 / .25)" />
                <circle cx={x(hover)} cy={y(weeks[hover].count)} r={5} fill="#a78bfa" stroke="#0d0d17" strokeWidth={2} />
              </g>
            )}
          </svg>
        )}
        {hover !== null && (
          <Tip x={x(hover)} y={y(weeks[hover].count)} w={w}>
            <p className="text-zinc-400">{fmt(weeks[hover].start)} 〜 {fmt(weeks[hover].end)}</p>
            <p className="mt-0.5 font-semibold text-white"><span className="font-mono text-sm">{weeks[hover].count}</span> contributions</p>
          </Tip>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Calendar heatmap */

// 単一色相 (violet) の明度ステップ。暗い背景では明るいほど多い
const HEAT = ["rgb(255 255 255 / .05)", "#3b2a6b", "#5b3fb0", "#8b6cf0", "#c4b5fd"];

export function ContributionCalendar({ days }: { days: { date: string; count: number }[] }) {
  const [wrap, w] = useWidth<HTMLDivElement>();
  const [view, seen] = useInView<HTMLDivElement>();
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  const first = days.length ? new Date(days[0].date).getDay() : 0;
  const cols = Math.ceil((days.length + first) / 7);
  const gap = 3;
  const cell = Math.max(6, Math.min(14, Math.floor((w - 24 - gap * cols) / cols)));
  const nonzero = days.map((d) => d.count).filter(Boolean).sort((a, b) => a - b);
  const q = (p: number) => nonzero[Math.floor(p * (nonzero.length - 1))] ?? 1;
  const level = (c: number) => (c === 0 ? 0 : c <= q(0.25) ? 1 : c <= q(0.5) ? 2 : c <= q(0.8) ? 3 : 4);

  return (
    <div ref={view}>
      <div ref={wrap} className="relative overflow-x-auto">
        {w > 0 && (
          <svg width={24 + cols * (cell + gap)} height={7 * (cell + gap)} className="block" onPointerLeave={() => setHover(null)}
            role="img" aria-label="コントリビューションカレンダー">
            {["", "月", "", "水", "", "金", ""].map((l, r) => (
              <text key={r} x={0} y={r * (cell + gap) + cell / 2} dy="0.32em" className="fill-zinc-600 text-[9px]">{l}</text>
            ))}
            {days.map((d, i) => {
              const k = i + first, c = Math.floor(k / 7), r = k % 7;
              const cx = 24 + c * (cell + gap), cy = r * (cell + gap);
              return (
                <rect key={d.date} x={cx} y={cy} width={cell} height={cell} rx={2}
                  fill={HEAT[level(d.count)]}
                  stroke={hover?.i === i ? "#fff" : "none"} strokeWidth={1}
                  style={{ opacity: seen ? 1 : 0, transition: reduced() ? "none" : `opacity .4s ${c * 18}ms` }}
                  onPointerEnter={() => setHover({ i, x: cx + cell / 2, y: cy + cell / 2 })} />
              );
            })}
          </svg>
        )}
        {hover && (
          <Tip x={hover.x} y={hover.y} w={w}>
            <span className="font-mono font-semibold text-white">{days[hover.i].count}</span>
            <span className="text-zinc-400"> contributions · {new Date(days[hover.i].date).toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" })}</span>
          </Tip>
        )}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1.5 text-[10px] text-zinc-500">
        少 {HEAT.map((c) => <span key={c} className="size-2.5 rounded-[2px]" style={{ background: c }} />)} 多
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Donut */

export function Donut({ data, label }: { data: { name: string; color: string; value: number }[]; label: string }) {
  const [view, seen] = useInView<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const R = 50, SW = 18, C = 2 * Math.PI * R, GAP = 2.5;
  let acc = 0;
  const segs = data.map((d) => {
    const len = (d.value / total) * C;
    const s = { ...d, off: acc, len: Math.max(0, len - GAP), pct: (d.value / total) * 100 };
    acc += len;
    return s;
  });
  const active = hover !== null ? segs[hover] : null;

  return (
    <div ref={view} className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <div className="relative shrink-0">
        <svg width={140} height={140} viewBox="0 0 140 140" role="img" aria-label={`${label}: ${segs.map((s) => `${s.name} ${s.pct.toFixed(0)}%`).join(", ")}`}>
          <g transform="rotate(-90 70 70)">
            <circle cx={70} cy={70} r={R} fill="none" stroke="rgb(255 255 255 / .04)" strokeWidth={SW} />
            {segs.map((s, i) => (
              <circle key={s.name} cx={70} cy={70} r={R} fill="none" stroke={s.color}
                strokeWidth={hover === i ? SW + 6 : SW}
                strokeDasharray={`${seen ? s.len : 0} ${C}`} strokeDashoffset={-s.off}
                opacity={hover === null || hover === i ? 1 : 0.35}
                className="cursor-pointer"
                style={{ transition: reduced() ? "none" : `stroke-dasharray 1s cubic-bezier(.3,.7,.2,1) ${i * 120}ms, stroke-width .2s, opacity .2s` }}
                onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} />
            ))}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          {active ? (
            <div>
              <p className="font-mono text-xl font-semibold text-white">{active.pct.toFixed(0)}%</p>
              <p className="max-w-[90px] truncate text-[11px] text-zinc-400">{active.name}</p>
            </div>
          ) : (
            <div>
              <p className="font-mono text-xl font-semibold text-white">{data.length - (data.some((d) => d.name === "Other") ? 1 : 0)}{data.some((d) => d.name === "Other") ? "+" : ""}</p>
              <p className="text-[11px] text-zinc-500">languages</p>
            </div>
          )}
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-1.5">
        {segs.map((s, i) => (
          <li key={s.name}>
            <button onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1 text-left text-sm transition ${hover === i ? "bg-white/[0.06]" : ""}`}>
              <span className="size-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
              <span className="min-w-0 flex-1 truncate text-zinc-200">{s.name}</span>
              <span className="font-mono text-xs tabular-nums text-zinc-500">{s.pct.toFixed(1)}%</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ Hour bars */

export function HourBars({ hours, height = 180 }: { hours: number[]; height?: number }) {
  const [wrap, w] = useWidth<HTMLDivElement>();
  const [view, seen] = useInView<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 28, r: 4, t: 10, b: 22 };
  const iw = Math.max(0, w - pad.l - pad.r), ih = height - pad.t - pad.b;
  const max = niceMax(Math.max(...hours, 1));
  const bw = iw / 24;
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const total = hours.reduce((s, v) => s + v, 0) || 1;

  return (
    <div ref={view}>
      <div ref={wrap} className="relative">
        {w > 0 && (
          <svg width={w} height={height} className="block" onPointerLeave={() => setHover(null)} role="img" aria-label="時間帯別コミット数">
            {[0, max / 2, max].map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={pad.l + iw} y1={y(t)} y2={y(t)} stroke="rgb(255 255 255 / .06)" strokeDasharray={t === 0 ? undefined : "2 4"} />
                <text x={pad.l - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-zinc-500 font-mono text-[10px]">{t}</text>
              </g>
            ))}
            {hours.map((v, h) => {
              const bh = (v / max) * ih;
              const x = pad.l + h * bw + 1; // 2px の隙間
              const width = Math.max(1, bw - 2);
              const r = Math.min(4, width / 2, bh);
              const top = pad.t + ih - bh;
              return (
                <g key={h} onPointerEnter={() => setHover(h)}>
                  <rect x={pad.l + h * bw} y={pad.t} width={bw} height={ih} fill="transparent" />
                  {v > 0 && (
                    <path
                      d={`M${x},${pad.t + ih}V${top + r}Q${x},${top} ${x + r},${top}H${x + width - r}Q${x + width},${top} ${x + width},${top + r}V${pad.t + ih}Z`}
                      fill={hover === null || hover === h ? "#22d3ee" : "rgb(34 211 238 / .35)"}
                      style={{
                        transformOrigin: `0 ${pad.t + ih}px`, transform: seen ? "scaleY(1)" : "scaleY(0)",
                        transition: reduced() ? "none" : `transform .7s cubic-bezier(.3,.7,.2,1) ${h * 30}ms, fill .15s`,
                      }} />
                  )}
                </g>
              );
            })}
            {[0, 6, 12, 18, 23].map((h) => (
              <text key={h} x={pad.l + h * bw + bw / 2} y={height - 6} textAnchor="middle" className="fill-zinc-500 font-mono text-[10px]">{h}</text>
            ))}
          </svg>
        )}
        {hover !== null && (
          <Tip x={pad.l + hover * bw + bw / 2} y={y(hours[hover]) - 4} w={w}>
            <p className="text-zinc-400">{hover}:00 – {hover}:59</p>
            <p className="mt-0.5 font-semibold text-white">
              <span className="font-mono text-sm">{hours[hover]}</span> commits
              <span className="ml-1.5 font-normal text-zinc-500">({((hours[hover] / total) * 100).toFixed(1)}%)</span>
            </p>
          </Tip>
        )}
      </div>
    </div>
  );
}
