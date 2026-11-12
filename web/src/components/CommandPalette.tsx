import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Search } from "lucide-react";
import { Icon } from "./Icon";

export interface Entry {
  id: string;
  title: string;
  subtitle: string;
  icon?: string;
  href: string;
  group: string;
}

export function CommandPalette({ entries, open, onClose }: { entries: Entry[]; open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return entries;
    return entries
      .map((e) => {
        const hay = `${e.title} ${e.subtitle} ${e.id}`.toLowerCase();
        let score = hay.indexOf(t);
        if (score < 0) {
          // 文字が順番に含まれていればヒット (fuzzy)
          let i = 0;
          for (const ch of hay) if (ch === t[i]) i++;
          score = i === t.length ? 100 : -1;
        }
        return { e, score };
      })
      .filter((x) => x.score >= 0)
      .sort((a, b) => a.score - b.score)
      .map((x) => x.e);
  }, [q, entries]);

  useEffect(() => {
    if (open) { setQ(""); setSel(0); setTimeout(() => input.current?.focus(), 10); }
  }, [open]);
  useEffect(() => setSel(0), [q]);

  if (!open) return null;

  const go = (e?: Entry) => { if (e) { window.open(e.href, "_blank", "noopener"); onClose(); } };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div className="card rise w-full max-w-xl overflow-hidden bg-ink-900/95 shadow-2xl shadow-black/60" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-white/5 px-4">
          <Search className="size-5 text-zinc-500" />
          <input ref={input} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="デバイスやリンクを検索…"
            className="h-14 flex-1 bg-transparent text-base text-white outline-none placeholder:text-zinc-600"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              if (e.key === "Enter") go(results[sel]);
              if (e.key === "Escape") onClose();
            }} />
          <span className="kbd">Esc</span>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2">
          {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-zinc-500">見つかりません</li>}
          {results.map((e, i) => (
            <li key={e.group + e.id}>
              <button onMouseEnter={() => setSel(i)} onClick={() => go(e)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${i === sel ? "bg-white/[0.07]" : ""}`}>
                <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5">
                  <Icon name={e.icon} className="size-4 text-violet-300" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-white">{e.title}</span>
                  <span className="block truncate font-mono text-xs text-zinc-500">{e.subtitle}</span>
                </span>
                <span className="text-[11px] text-zinc-600">{e.group}</span>
                {i === sel && <CornerDownLeft className="size-4 text-zinc-500" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
