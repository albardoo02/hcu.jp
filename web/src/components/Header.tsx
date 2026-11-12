import { useEffect, useRef, useState } from "react";
import { LogOut, Search, Settings as Gear, UserRound } from "lucide-react";
import { api, navigate, type Me } from "../api";
import { Logo } from "./Logo";

export function Header({ me, onSearch }: { me: Me; onSearch?: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    addEventListener("mousedown", close);
    return () => removeEventListener("mousedown", close);
  }, []);

  async function logout() {
    await api("/api/auth/logout", {});
    location.href = "/login";
  }

  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-ink-950/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-5">
        <Logo />
        <div className="flex-1" />
        {onSearch && (
          <button onClick={onSearch}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] py-2 pl-3 pr-2 text-sm text-zinc-500 transition hover:border-white/20 hover:text-zinc-300 sm:w-64">
            <Search className="size-4" />
            <span className="hidden flex-1 text-left sm:inline">ジャンプ…</span>
            <span className="kbd hidden sm:inline">{isMac ? "⌘" : "Ctrl"} K</span>
          </button>
        )}
        <div ref={ref} className="relative">
          <button onClick={() => setOpen((v) => !v)} aria-label="アカウントメニュー"
            className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 text-sm font-bold uppercase text-white ring-2 ring-white/10 transition hover:ring-white/30">
            {me.username.slice(0, 1)}
          </button>
          {open && (
            <div className="card absolute right-0 mt-2 w-56 bg-ink-900/95 p-1.5 shadow-2xl shadow-black/50">
              <div className="px-3 py-2">
                <p className="text-sm font-semibold text-white">{me.username}</p>
                <p className="text-xs text-zinc-500">{me.totp ? "二段階認証: 有効" : "二段階認証: 無効"}</p>
              </div>
              <div className="my-1 h-px bg-white/5" />
              <MenuItem icon={UserRound} onClick={() => { setOpen(false); navigate("/portfolio"); }}>ポートフォリオ</MenuItem>
              <MenuItem icon={Gear} onClick={() => { setOpen(false); navigate("/settings"); }}>設定</MenuItem>
              <MenuItem icon={LogOut} onClick={logout}>ログアウト</MenuItem>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function MenuItem({ icon: I, children, onClick }: { icon: typeof Gear; children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white">
      <I className="size-4 text-zinc-500" />
      {children}
    </button>
  );
}
