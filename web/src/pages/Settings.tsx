import { useState, type FormEvent } from "react";
import { ArrowLeft, KeyRound, ShieldCheck, ShieldOff } from "lucide-react";
import { api, ApiError, navigate, type Me } from "../api";
import { Header } from "../components/Header";

export function Settings({ me, onChange }: { me: Me; onChange: () => Promise<void> }) {
  return (
    <>
      <Header me={me} />
      <main className="mx-auto max-w-2xl px-5 pb-24 pt-10">
        <button onClick={() => navigate("/")} className="mb-6 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-white">
          <ArrowLeft className="size-4" /> ダッシュボード
        </button>
        <h1 className="text-3xl font-bold tracking-tight text-white">設定</h1>
        <PasswordCard />
        <TotpCard me={me} onChange={onChange} />
      </main>
    </>
  );
}

function useForm() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<string | void>) {
    setBusy(true);
    setMsg(null);
    try {
      const text = await fn();
      if (text) setMsg({ ok: true, text });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? e.message : "エラーが発生しました" });
    } finally {
      setBusy(false);
    }
  }
  const view = msg && (
    <p className={`mt-4 rounded-lg border px-3 py-2 text-sm ${msg.ok ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-rose-500/20 bg-rose-500/10 text-rose-300"}`}>
      {msg.text}
    </p>
  );
  return { busy, run, view };
}

function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const f = useForm();

  function submit(e: FormEvent) {
    e.preventDefault();
    f.run(async () => {
      if (next !== confirm) throw new ApiError(400, { error: "新しいパスワードが一致しません" });
      await api("/api/me/password", { current, next });
      setCurrent(""); setNext(""); setConfirm("");
      return "パスワードを変更しました。他の端末のセッションはログアウトされました。";
    });
  }

  return (
    <form onSubmit={submit} className="card mt-8 p-6">
      <h2 className="flex items-center gap-2 font-semibold text-white"><KeyRound className="size-4 text-violet-300" />パスワード変更</h2>
      <div className="mt-5 grid gap-3">
        <input className="input" type="password" placeholder="現在のパスワード" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        <input className="input" type="password" placeholder="新しいパスワード (10 文字以上)" autoComplete="new-password" minLength={10} required value={next} onChange={(e) => setNext(e.target.value)} />
        <input className="input" type="password" placeholder="新しいパスワード (確認)" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      {f.view}
      <button className="btn-primary mt-5" disabled={f.busy}>変更する</button>
    </form>
  );
}

function TotpCard({ me, onChange }: { me: Me; onChange: () => Promise<void> }) {
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const f = useForm();

  const start = () => f.run(async () => { setSetup(await api("/api/me/totp/setup", {})); });

  function submit(e: FormEvent) {
    e.preventDefault();
    f.run(async () => {
      await api(me.totp ? "/api/me/totp/disable" : "/api/me/totp/enable", { code });
      setCode(""); setSetup(null);
      await onChange();
      return me.totp ? "二段階認証を無効にしました" : "二段階認証を有効にしました 🎉";
    });
  }

  return (
    <section className="card mt-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-white">
            {me.totp ? <ShieldCheck className="size-4 text-emerald-300" /> : <ShieldOff className="size-4 text-amber-300" />}
            二段階認証 (TOTP)
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            {me.totp ? "有効です。ログイン時に認証アプリのコードが必要です。" : "Google Authenticator や 1Password などの認証アプリを使います。強く推奨します。"}
          </p>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs ${me.totp ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" : "border-amber-400/20 bg-amber-400/10 text-amber-300"}`}>
          {me.totp ? "有効" : "無効"}
        </span>
      </div>

      {!me.totp && !setup && <button onClick={start} className="btn-primary mt-5" disabled={f.busy}>設定を始める</button>}

      {(setup || me.totp) && (
        <form onSubmit={submit} className="mt-5">
          {setup && (
            <div className="mb-5 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              <div className="size-44 shrink-0 overflow-hidden rounded-xl bg-white p-2 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: setup.qr }} />
              <div className="text-sm text-zinc-400">
                <p>1. 認証アプリで QR コードを読み取ります。</p>
                <p className="mt-2">読み取れない場合はキーを手入力:</p>
                <code className="mt-1 block break-all rounded-lg bg-black/40 px-3 py-2 font-mono text-xs text-cyan-300">{setup.secret}</code>
                <p className="mt-3">2. 表示された 6 桁のコードを入力して確定します。</p>
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <input className="input font-mono tracking-[0.3em]" inputMode="numeric" maxLength={6} pattern="\d{6}" required
              placeholder="000000" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
            <button className={me.totp ? "btn-ghost shrink-0" : "btn-primary shrink-0"} disabled={f.busy}>
              {me.totp ? "無効にする" : "有効にする"}
            </button>
          </div>
        </form>
      )}
      {f.view}
    </section>
  );
}
