import { existsSync, readFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { Hono, type Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { secureHeaders } from "hono/secure-headers";
import { serveStatic } from "@hono/node-server/serve-static";
import QRCode from "qrcode";
import { config, deviceUrl } from "./config.ts";
import { db, type UserRow } from "./db.ts";
import { DUMMY_HASH, hashPassword, newTotpSecret, verifyPassword, verifyTotp } from "./crypto.ts";
import {
  COOKIE_NAME, cookieOptions, createSession, deleteOtherSessions, deleteSession, getSessionUser,
} from "./session.ts";
import { probeAll, wake } from "./net.ts";

type Env = { Bindings: { incoming: IncomingMessage }; Variables: { user: UserRow; token: string } };

export const app = new Hono<Env>();

const clientIp = (c: Context<Env>) =>
  c.req.header("cf-connecting-ip") ?? c.env.incoming?.socket.remoteAddress ?? "unknown";

// ---- ログイン試行回数の制限 (IP / ユーザー名ごと、15 分で 8 回まで) ----
const attempts = new Map<string, { n: number; until: number }>();
const WINDOW = 15 * 60_000, LIMIT = 8;
function limited(key: string) {
  const a = attempts.get(key);
  return !!a && a.until > Date.now() && a.n >= LIMIT;
}
function fail(key: string) {
  const a = attempts.get(key);
  if (!a || a.until < Date.now()) attempts.set(key, { n: 1, until: Date.now() + WINDOW });
  else a.n++;
}

/** ログイン後のリダイレクト先を自ドメイン配下に限定 */
function safeNext(next: unknown): string {
  if (typeof next !== "string" || !next) return "/";
  if (next.startsWith("/") && !next.startsWith("//")) return next;
  try {
    const u = new URL(next);
    const base = config.site.baseDomain;
    if ((u.host === base || u.host.endsWith(`.${base}`)) && u.protocol === `${config.site.scheme}:`) return u.href;
  } catch {}
  return "/";
}

app.use("*", secureHeaders({ crossOriginResourcePolicy: "same-origin", referrerPolicy: "same-origin" }));

// ---- CSRF: 状態を変える API は同一オリジンからのみ ----
app.use("/api/*", async (c, next) => {
  if (c.req.method !== "GET" && c.req.method !== "HEAD") {
    const origin = c.req.header("origin");
    const host = c.req.header("host");
    if (!origin || !host || new URL(origin).host !== host) return c.json({ error: "bad origin" }, 403);
  }
  await next();
});

// ---- 認証 ----
app.post("/api/auth/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");
  const ip = clientIp(c);
  const keys = [`ip:${ip}`, `u:${username.toLowerCase()}`];
  if (keys.some(limited)) return c.json({ error: "試行回数が多すぎます。しばらく待ってから再度お試しください。" }, 429);

  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as UserRow | undefined;
  const ok = verifyPassword(password, user?.password_hash ?? DUMMY_HASH) && !!user;
  if (!ok) {
    keys.forEach(fail);
    return c.json({ error: "ユーザー名またはパスワードが違います" }, 401);
  }
  if (user.totp_secret) {
    if (!body.totp) return c.json({ needTotp: true });
    if (!verifyTotp(user.totp_secret, String(body.totp))) {
      keys.forEach(fail);
      return c.json({ error: "認証コードが違います", needTotp: true }, 401);
    }
  }
  keys.forEach((k) => attempts.delete(k));
  const token = createSession(user.id, ip, c.req.header("user-agent") ?? "");
  setCookie(c, COOKIE_NAME, token, cookieOptions());
  return c.json({ ok: true, redirect: safeNext(body.next) });
});

app.post("/api/auth/logout", (c) => {
  deleteSession(getCookie(c, COOKIE_NAME));
  deleteCookie(c, COOKIE_NAME, { path: "/", domain: config.site.cookieDomain });
  return c.json({ ok: true });
});

// ---- ここから先はログイン必須 ----
app.use("/api/*", async (c, next) => {
  const token = getCookie(c, COOKIE_NAME);
  const user = getSessionUser(token);
  if (!user || !token) return c.json({ error: "unauthorized" }, 401);
  c.set("user", user);
  c.set("token", token);
  await next();
});

app.get("/api/me", (c) => {
  const u = c.get("user");
  return c.json({ username: u.username, totp: !!u.totp_secret });
});

app.get("/api/dashboard", (c) =>
  c.json({
    title: config.site.title,
    devices: config.devices.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description ?? "",
      icon: d.icon ?? "server",
      url: d.noProxy ? null : deviceUrl(d),
      lan: d.lan ?? d.target,
      wol: !!d.mac,
    })),
    links: config.links,
  }),
);

app.get("/api/status", async (c) => c.json(await probeAll()));

app.post("/api/devices/:id/wake", async (c) => {
  const d = config.devices.find((x) => x.id === c.req.param("id"));
  if (!d?.mac) return c.json({ error: "not found" }, 404);
  await wake(d.mac);
  return c.json({ ok: true });
});

app.post("/api/me/password", async (c) => {
  const { current, next } = await c.req.json();
  const u = c.get("user");
  if (!verifyPassword(String(current ?? ""), u.password_hash)) return c.json({ error: "現在のパスワードが違います" }, 400);
  if (String(next ?? "").length < 10) return c.json({ error: "新しいパスワードは 10 文字以上にしてください" }, 400);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(String(next)), u.id);
  deleteOtherSessions(u.id, c.get("token"));
  return c.json({ ok: true });
});

app.post("/api/me/totp/setup", async (c) => {
  const u = c.get("user");
  if (u.totp_secret) return c.json({ error: "既に有効です" }, 400);
  const secret = newTotpSecret();
  db.prepare("UPDATE users SET totp_pending = ? WHERE id = ?").run(secret, u.id);
  const uri = `otpauth://totp/${encodeURIComponent(config.site.title)}:${encodeURIComponent(u.username)}?secret=${secret}&issuer=${encodeURIComponent(config.site.title)}`;
  const qr = await QRCode.toString(uri, { type: "svg", margin: 1, color: { dark: "#0b0b14", light: "#ffffff" } });
  return c.json({ secret, qr });
});

app.post("/api/me/totp/enable", async (c) => {
  const { code } = await c.req.json();
  const u = c.get("user");
  if (!u.totp_pending || !verifyTotp(u.totp_pending, String(code ?? ""))) return c.json({ error: "コードが違います" }, 400);
  db.prepare("UPDATE users SET totp_secret = totp_pending, totp_pending = NULL WHERE id = ?").run(u.id);
  return c.json({ ok: true });
});

app.post("/api/me/totp/disable", async (c) => {
  const { code } = await c.req.json();
  const u = c.get("user");
  if (!u.totp_secret || !verifyTotp(u.totp_secret, String(code ?? ""))) return c.json({ error: "コードが違います" }, 400);
  db.prepare("UPDATE users SET totp_secret = NULL WHERE id = ?").run(u.id);
  return c.json({ ok: true });
});

app.all("/api/*", (c) => c.json({ error: "not found" }, 404));

// ---- フロントエンド (ビルド済み SPA) ----
const WEB_ROOT = "./dist/web";
if (existsSync(WEB_ROOT)) {
  const index = readFileSync(`${WEB_ROOT}/index.html`, "utf8");
  app.use("/assets/*", serveStatic({ root: WEB_ROOT }));
  app.use("*", serveStatic({ root: WEB_ROOT }));
  app.get("*", (c) => c.html(index));
} else {
  app.get("/", (c) => c.text("フロントエンドが未ビルドです。開発時は http://localhost:5173 を開いてください。"));
}
