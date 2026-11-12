import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";

export interface Device {
  /** サブドメイン名にもなる ID (例: router → router.hcu.jp) */
  id: string;
  name: string;
  description?: string;
  /** lucide アイコン名 (router, server, hard-drive, monitor, printer, cctv ...) */
  icon?: string;
  /** プロキシ先 (例: http://192.168.1.1) */
  target: string;
  /** 自宅 LAN 内から直接開く URL (省略時は target) */
  lan?: string;
  /** 自己署名証明書の HTTPS ターゲットを許可 */
  insecure?: boolean;
  /** Wake-on-LAN 用 MAC アドレス */
  mac?: string;
  /** プロキシせず、LAN 内リンクとステータス表示のみ */
  noProxy?: boolean;
}

export interface LinkItem {
  name: string;
  url: string;
  description?: string;
  icon?: string;
  status?: "公開中" | "開発中" | "公開準備中" | "公開停止中" | "アーカイブ";
}

export interface LinkGroup {
  group: string;
  items: LinkItem[];
}

export interface Portfolio {
  /** GitHub のユーザー名 */
  github: string;
  /** コミット時間帯グラフのタイムゾーン */
  timezone: string;
  /** 自己紹介 (改行可) */
  about?: string;
  /** 宣伝する GitHub Organization */
  org?: string;
  /** 宣伝セクションの文言 */
  promo?: { title?: string; body?: string; address?: string; website?: string; discord?: string };
}

export interface Config {
  site: {
    title: string;
    /** ポータル本体のホスト (例: hcu.jp) */
    baseDomain: string;
    /** 公開 URL のスキーム。Cloudflare Tunnel 越しなら https */
    scheme: "https" | "http";
    /** セッション Cookie の Domain (例: .hcu.jp) — サブドメイン間で共有するため */
    cookieDomain?: string;
    sessionDays: number;
  };
  wol?: { broadcast?: string; port?: number };
  devices: Device[];
  links: LinkGroup[];
  portfolio: Portfolio;
  /** 短縮 URL (例: pc → hcu.jp/pc でリダイレクト)。旧 .htaccess の置き換え */
  redirects: Record<string, string>;
}

const CONFIG_PATH = resolve(process.env.HCU_CONFIG ?? "hcu.config.yaml");

function load(): Config {
  const path = existsSync(CONFIG_PATH) ? CONFIG_PATH : resolve("hcu.config.example.yaml");
  const raw = parse(readFileSync(path, "utf8")) as Partial<Config>;
  const site = {
    title: "hcu.jp",
    baseDomain: "hcu.jp",
    scheme: "https" as const,
    sessionDays: 14,
    ...raw.site,
  };
  const devices = (raw.devices ?? []).map((d) => ({ ...d, id: String(d.id).toLowerCase() }));
  for (const d of devices) {
    if (!/^[a-z0-9-]+$/.test(d.id)) throw new Error(`device id "${d.id}" はサブドメインとして使えません`);
  }
  console.log(`[config] ${path} を読み込みました (devices: ${devices.length})`);
  const portfolio = { github: "albardoo02", timezone: "Asia/Tokyo", ...raw.portfolio };
  const redirects = Object.fromEntries(
    Object.entries(raw.redirects ?? {}).map(([k, v]) => [k.toLowerCase().replace(/^\/+|\/+$/g, ""), String(v)]),
  );
  return { site, wol: raw.wol, devices, links: raw.links ?? [], portfolio, redirects };
}

export const config = load();

export const portalOrigin = `${config.site.scheme}://${config.site.baseDomain}`;
export const deviceUrl = (d: Device) => `${config.site.scheme}://${d.id}.${config.site.baseDomain}`;
