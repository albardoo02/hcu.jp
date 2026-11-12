import { config } from "./config.ts";
import { db, type UserRow } from "./db.ts";
import { randomToken, sha256 } from "./crypto.ts";

export const COOKIE_NAME = "hcu_session";

export function createSession(userId: number, ip: string, ua: string): string {
  const token = randomToken();
  const expires = Math.floor(Date.now() / 1000) + config.site.sessionDays * 86400;
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?)")
    .run(sha256(token), userId, expires, ip, ua.slice(0, 300));
  return token;
}

export function getSessionUser(token: string | undefined): UserRow | null {
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > unixepoch()`).get(sha256(token)) as UserRow | undefined;
  return row ?? null;
}

export function deleteSession(token: string | undefined) {
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
}

export function deleteOtherSessions(userId: number, keepToken: string) {
  db.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").run(userId, sha256(keepToken));
}

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: config.site.scheme === "https",
    sameSite: "Lax" as const,
    path: "/",
    domain: config.site.cookieDomain,
    maxAge: config.site.sessionDays * 86400,
  };
}

/** 生の Cookie ヘッダからセッショントークンを取り出す (プロキシ用) */
export function tokenFromCookieHeader(header: string | undefined): string | undefined {
  if (!header) return;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE_NAME) return decodeURIComponent(v.join("="));
  }
}

/** プロキシ先にポータルのセッション Cookie を渡さない */
export function stripSessionCookie(header: string | undefined): string | undefined {
  if (!header) return;
  const rest = header.split(";").map((s) => s.trim()).filter((s) => s && !s.startsWith(`${COOKIE_NAME}=`));
  return rest.length ? rest.join("; ") : undefined;
}

// 期限切れセッションの掃除
setInterval(() => db.prepare("DELETE FROM sessions WHERE expires_at <= unixepoch()").run(), 3600_000).unref();
