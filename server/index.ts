import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { getRequestListener } from "@hono/node-server";
import httpProxy from "http-proxy";
import { app } from "./app.ts";
import { config, portalOrigin, type Device } from "./config.ts";
import { getSessionUser, stripSessionCookie, tokenFromCookieHeader } from "./session.ts";

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "0.0.0.0";

const honoListener = getRequestListener(app.fetch);

const proxy = httpProxy.createProxyServer({
  changeOrigin: true, // ルーター等は Host ヘッダが自分の IP でないと弾くことが多い
  xfwd: false,
  ws: true,
  autoRewrite: true,
  protocolRewrite: config.site.scheme,
});

// リダイレクト先 (Location) が LAN の IP を指していたらサブドメインに書き換える
proxy.on("proxyRes", (proxyRes, req) => {
  const device = (req as IncomingMessage & { device?: Device }).device;
  const loc = proxyRes.headers.location;
  if (device && loc) {
    try {
      const target = new URL(device.target);
      const u = new URL(loc, device.target);
      if (u.host === target.host) {
        proxyRes.headers.location = `${config.site.scheme}://${req.headers.host}${u.pathname}${u.search}${u.hash}`;
      }
    } catch {}
  }
  // プロキシ先の Cookie を親ドメインに漏らさない
  const sc = proxyRes.headers["set-cookie"];
  if (sc) proxyRes.headers["set-cookie"] = sc.map((s) => s.replace(/;\s*domain=[^;]*/gi, ""));
});

proxy.on("error", (err, _req, res) => {
  if ("writeHead" in res && !res.headersSent) {
    res.writeHead(502, { "content-type": "text/html; charset=utf-8" });
    res.end(errorPage("デバイスに接続できません", `プロキシ先が応答しませんでした (${err.message})。電源やネットワークを確認してください。`));
  } else {
    res.end();
  }
});

function errorPage(title: string, msg: string) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#08080f;color:#e7e7f0;font-family:system-ui,sans-serif">
<div style="max-width:28rem;padding:2rem;text-align:center"><h1 style="font-size:1.25rem">${title}</h1>
<p style="color:#9a9ab0;line-height:1.7">${msg}</p><a href="${portalOrigin}" style="color:#a78bfa">ダッシュボードに戻る</a></div>`;
}

/** Host ヘッダから対象デバイスを特定 (router.hcu.jp → router) */
function deviceFor(host: string | undefined): Device | undefined {
  if (!host) return;
  const h = host.toLowerCase();
  const base = config.site.baseDomain.toLowerCase();
  const suffix = `.${base}`;
  // baseDomain にポートが含まれない場合は host のポートを無視する
  const hostNoPort = base.includes(":") ? h : h.replace(/:\d+$/, "");
  if (!hostNoPort.endsWith(suffix)) return;
  const sub = hostNoPort.slice(0, -suffix.length);
  return config.devices.find((d) => d.id === sub && !d.noProxy);
}

function authorized(req: IncomingMessage) {
  return !!getSessionUser(tokenFromCookieHeader(req.headers.cookie));
}

function prepare(req: IncomingMessage, device: Device) {
  (req as IncomingMessage & { device?: Device }).device = device;
  const cookie = stripSessionCookie(req.headers.cookie);
  if (cookie) req.headers.cookie = cookie;
  else delete req.headers.cookie;
  delete req.headers["cf-connecting-ip"];
  delete req.headers["cf-ipcountry"];
  delete req.headers["cf-ray"];
  delete req.headers["cf-visitor"];
  // Origin/Referer チェックをするルーター対策
  const target = new URL(device.target);
  if (req.headers.origin) req.headers.origin = target.origin;
  if (req.headers.referer) {
    try {
      const r = new URL(req.headers.referer);
      req.headers.referer = target.origin + r.pathname + r.search;
    } catch {}
  }
}

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const device = deviceFor(req.headers.host);
  if (!device) return honoListener(req, res);

  if (!authorized(req)) {
    const next = `${config.site.scheme}://${req.headers.host}${req.url ?? "/"}`;
    res.writeHead(302, { location: `${portalOrigin}/login?next=${encodeURIComponent(next)}`, "cache-control": "no-store" });
    return res.end();
  }
  prepare(req, device);
  proxy.web(req, res, { target: device.target, secure: !device.insecure });
});

// WebSocket (NAS / Proxmox / Home Assistant のコンソール等)
server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
  const device = deviceFor(req.headers.host);
  if (!device || !authorized(req)) {
    socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    return socket.destroy();
  }
  prepare(req, device);
  proxy.ws(req, socket, head, { target: device.target, secure: !device.insecure });
});

server.listen(PORT, HOST, () => {
  console.log(`[hcu.jp] listening on http://${HOST}:${PORT}  (portal: ${portalOrigin})`);
  for (const d of config.devices.filter((d) => !d.noProxy)) {
    console.log(`  ↳ ${d.id}.${config.site.baseDomain} → ${d.target}`);
  }
});
