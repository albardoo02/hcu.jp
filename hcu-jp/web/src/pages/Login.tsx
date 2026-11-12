import { useRef, useState, type FormEvent } from "react";
import { ArrowRight, KeyRound, Lock, ShieldCheck, User } from "lucide-react";
import { api, ApiError, navigate } from "../api";
import { Logo } from "../components/Logo";

export function Login({ onLogin }: { onLogin: () => Promise<void> }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [needTotp, setNeedTotp] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const totpRef = useRef<HTMLInputElement>(null);

  const next = new URLSearchParams(location.search).get("next") ?? "/";
  const target = (() => {
    try { return new URL(next, location.href).host; } catch { return null; }
  })();
  const toDevice = target && target !== location.host;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api<{ ok?: boolean; needTotp?: boolean; redirect?: string }>("/api/auth/login", {
        username, password, totp: needTotp ? totp : undefined, next,
      });
      if (r.needTotp) {
        setNeedTotp(true);
        setTimeout(() => totpRef.current?.focus(), 50);
        return;
      }
      const dest = r.redirect ?? "/";
      if (/^https?:/.test(dest)) location.href = dest;
      else { navigate(dest); await onLogin(); }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "通信エラーが発生しました");
      if (needTotp) setTotp("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto grid min-h-dvh max-w-6xl items-center gap-12 px-5 py-10 lg:grid-cols-[1.1fr_1fr] lg:gap-20">
      <section className="rise hidden lg:block">
        <Logo className="mb-10" />
        <h1 className="text-6xl font-extrabold leading-[1.05] tracking-tight text-white">
          My lab,<br />
          <span className="text-gradient">one click away.</span>
        </h1>
        <p className="mt-6 max-w-md text-lg leading-relaxed text-zinc-400">
          自宅のサーバ・ルータ・NAS への入口。ログインすれば、どこからでもワンクリックで管理画面へ。
        </p>
        <ul className="mt-10 space-y-3 text-sm text-zinc-400">
          {[
            [ShieldCheck, "全ページ認証必須 + 二段階認証 (TOTP)"],
            [KeyRound, "サブドメインごとに自宅デバイスへ安全にプロキシ"],
            [Lock, "Cloudflare Tunnel 経由 — ポート開放不要"],
          ].map(([I, t], i) => {
            const C = I as typeof ShieldCheck;
            return (
              <li key={i} className="flex items-center gap-3">
                <span className="grid size-8 place-items-center rounded-lg border border-white/10 bg-white/5">
                  <C className="size-4 text-violet-300" />
                </span>
                {t as string}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rise mx-auto w-full max-w-md" style={{ animationDelay: "80ms" }}>
        <div className="mb-8 flex justify-center lg:hidden"><Logo /></div>
        <form onSubmit={submit} className="card relative overflow-hidden p-8 shadow-2xl shadow-black/40">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-400/60 to-transparent" />
          <h2 className="text-2xl font-bold text-white">{needTotp ? "二段階認証" : "サインイン"}</h2>
          <p className="mt-1.5 text-sm text-zinc-400">
            {needTotp
              ? "認証アプリに表示されている 6 桁のコードを入力してください。"
              : toDevice
                ? <>ログインすると <span className="font-mono text-cyan-300">{target}</span> に移動します。</>
                : "アカウントでログインしてください。"}
          </p>

          <div className="mt-7 space-y-4">
            {!needTotp ? (
              <>
                <Field icon={User} label="ユーザー名">
                  <input className="input pl-11" autoComplete="username" autoFocus required
                    value={username} onChange={(e) => setUsername(e.target.value)} />
                </Field>
                <Field icon={Lock} label="パスワード">
                  <input className="input pl-11" type="password" autoComplete="current-password" required
                    value={password} onChange={(e) => setPassword(e.target.value)} />
                </Field>
              </>
            ) : (
              <input ref={totpRef} className="input text-center font-mono text-2xl tracking-[0.5em]"
                inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="\d{6}" required
                placeholder="000000" value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, ""))} />
            )}
          </div>

          {error && (
            <p role="alert" className="mt-4 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {error}
            </p>
          )}

          <button className="btn-primary mt-6 w-full py-3" disabled={busy}>
            {busy ? "確認中…" : needTotp ? "確認" : "ログイン"}
            {!busy && <ArrowRight className="size-4" />}
          </button>
          {needTotp && (
            <button type="button" className="mt-3 w-full text-sm text-zinc-500 hover:text-zinc-300"
              onClick={() => { setNeedTotp(false); setTotp(""); setError(""); }}>
              ← 戻る
            </button>
          )}
        </form>
        <p className="mt-6 text-center text-xs text-zinc-600">
          アカウントの新規登録は受け付けていません
        </p>
      </section>
    </main>
  );
}

function Field({ icon: I, label, children }: { icon: typeof User; label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-zinc-400">{label}</span>
      <span className="relative block">
        <I className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
        {children}
      </span>
    </label>
  );
}
