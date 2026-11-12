# hcu.jp

- **未ログイン** → GitHub 風のポートフォリオ (グラフは GitHub API の実データ、ホバーで詳細) + AzisabaNetwork の宣伝
- **ログイン済み** → 自宅のルータ・サーバ・NAS の管理画面に **ワンクリック** で入れるダッシュボード (`/portfolio` でポートフォリオも見られます)
- **短縮 URL** → `hcu.jp/pc` などの旧 `.htaccess` のリダイレクトをそのまま維持 (301)

- **TypeScript** — バックエンド: Hono + Node.js 22 (`node:sqlite`)、フロントエンド: React 19 + Vite + Tailwind CSS v4
- **認証** — ユーザー名 + パスワード (scrypt)、TOTP 二段階認証、ログイン試行制限、CSRF 対策。新規登録なし (CLI で作成)
- **デバイス プロキシ** — `router.hcu.jp` のようにデバイスごとのサブドメインで LAN 内機器に認証付きで中継 (WebSocket 対応)
- **ステータス表示 / Wake-on-LAN / Ctrl+K 検索 / 数字キーで即起動**

## 仕組み

```
ブラウザ ──https──▶ Cloudflare ──Tunnel──▶ 自宅サーバ (このアプリ :8787)
                                              ├─ hcu.jp          → ダッシュボード
                                              ├─ router.hcu.jp   → 192.168.1.1   (要ログイン)
                                              └─ nas.hcu.jp      → 192.168.1.20  (要ログイン)
```

セッション Cookie を `.hcu.jp` に発行するので、一度ログインすれば全サブドメインに入れます。
未ログインで `router.hcu.jp` を開くとログイン画面に飛び、ログイン後に元のページへ戻ります。
ルータ側のポート開放は不要です。

## セットアップ (自宅サーバ)

```bash
git clone <this repo> hcu-jp && cd hcu-jp
cp hcu.config.example.yaml hcu.config.yaml   # デバイスの IP などを編集
```

### 1. Cloudflare Tunnel

1. Cloudflare ダッシュボード → Zero Trust → Networks → Tunnels → **Create a tunnel** (cloudflared)
2. 表示されたトークンを `.env` に `TUNNEL_TOKEN=...` として保存
3. Public Hostname を 2 つ追加 (どちらも Service: `HTTP` / `localhost:8787`)
   - `hcu.jp`
   - `*.hcu.jp`
4. DNS に `*` の CNAME (`<tunnel-id>.cfargotunnel.com`, Proxied) が無ければ手動で追加

### 2. 起動

```bash
docker compose up -d --build
docker compose exec hcu npx tsx server/cli.ts add <ユーザー名>
```

ログイン後、右上メニュー → 設定 から **二段階認証を有効化** してください。

### Docker を使わない場合

```bash
npm ci && npm run build
npm run user -- add <ユーザー名>
npm start            # PORT=8787
```

## ポートフォリオ

`hcu.config.yaml` の `portfolio:` で GitHub ユーザー名、自己紹介、宣伝する Organization と文言を設定します。

環境変数 `GITHUB_TOKEN` を設定すると、コントリビューション数・カレンダー・コミット言語・PR/Issue 数も表示されます
(無くてもプロフィール・言語・時間帯グラフ・リポジトリは表示されます)。
**fine-grained token で「Public repositories (read-only)」だけ** にしてください。`repo` 権限付きのトークンだと非公開の
Organization やプライベートリポジトリのコミットまで集計・公開されてしまいます。

データは 1 時間キャッシュされ、`data/github-cache.json` に保存されます。

## 短縮 URL

旧 `.htaccess` の `Redirect permanent` を `redirects:` に移植済みです (`pc`, `mobile`, `pcr`, `en`, `app`)。
追加はキーと URL を書き足すだけ。`.php` / `.html` の拡張子省略ルールは PHP を使わなくなったので不要になりました。

## ユーザー管理

```bash
npm run user -- add <name>        # 作成
npm run user -- passwd <name>     # パスワード変更 (全セッション無効化)
npm run user -- reset-2fa <name>  # 2FA を解除 (スマホ紛失時)
npm run user -- del <name>
npm run user -- list
```

## 開発

```bash
npm install
npm run user -- add dev
npm run dev     # http://localhost:5173
```

開発時は `hcu.config.yaml` の `site.scheme: http`, `baseDomain: localhost:8787` にし、`cookieDomain` を消してください。

## 注意

- 管理画面によっては (古いルータ等) サブドメイン経由だと表示が崩れるものがあります。その場合は `noProxy: true` にして LAN ボタンで直接開いてください。
- Wake-on-LAN はアプリが LAN と同じネットワークにいる必要があります (compose では `network_mode: host`)。
- `data/hcu.db` にユーザーとセッションが入ります。バックアップ推奨。
