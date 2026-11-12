import { createSocket } from "node:dgram";
import { connect } from "node:net";
import type { Device } from "./config.ts";
import { config } from "./config.ts";

export interface Status {
  up: boolean;
  ms: number | null;
}

/** TCP で到達確認 (ICMP は root 権限が要るため) */
export function probe(d: Device, timeout = 1500): Promise<Status> {
  const u = new URL(d.target);
  const port = Number(u.port || (u.protocol === "https:" ? 443 : 80));
  const start = performance.now();
  return new Promise((resolve) => {
    const sock = connect({ host: u.hostname, port });
    const done = (up: boolean) => {
      sock.destroy();
      resolve({ up, ms: up ? Math.round(performance.now() - start) : null });
    };
    sock.setTimeout(timeout, () => done(false));
    sock.once("connect", () => done(true));
    sock.once("error", () => done(false));
  });
}

let cache: { at: number; data: Record<string, Status> } | null = null;

export async function probeAll(): Promise<Record<string, Status>> {
  if (cache && Date.now() - cache.at < 5000) return cache.data;
  const entries = await Promise.all(config.devices.map(async (d) => [d.id, await probe(d)] as const));
  cache = { at: Date.now(), data: Object.fromEntries(entries) };
  return cache.data;
}

/** Wake-on-LAN マジックパケット送信 */
export function wake(mac: string): Promise<void> {
  const hex = mac.replace(/[^0-9a-f]/gi, "");
  if (hex.length !== 12) return Promise.reject(new Error("MAC アドレスが不正です"));
  const macBuf = Buffer.from(hex, "hex");
  const packet = Buffer.concat([Buffer.alloc(6, 0xff), ...Array(16).fill(macBuf)]);
  const sock = createSocket("udp4");
  return new Promise((resolve, reject) => {
    sock.once("error", reject);
    sock.bind(() => {
      sock.setBroadcast(true);
      sock.send(packet, config.wol?.port ?? 9, config.wol?.broadcast ?? "255.255.255.255", (err) => {
        sock.close();
        err ? reject(err) : resolve();
      });
    });
  });
}
