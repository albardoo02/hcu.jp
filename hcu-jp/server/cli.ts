// ユーザー管理 CLI
//   npm run user -- add <username>
//   npm run user -- passwd <username>
//   npm run user -- reset-2fa <username>
//   npm run user -- del <username>
//   npm run user -- list
import { createInterface } from "node:readline";
import { db } from "./db.ts";
import { hashPassword } from "./crypto.ts";

function askHidden(q: string): Promise<string> {
  if (process.env.HCU_PASSWORD) return Promise.resolve(process.env.HCU_PASSWORD);
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const rlAny = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
  let muted = false;
  rlAny._writeToOutput = (s: string) => { if (!muted) rlAny.output.write(s); };
  return new Promise((resolve) => {
    rl.question(q, (a) => { rl.close(); process.stdout.write("\n"); resolve(a); });
    muted = true;
  });
}

async function newPassword(): Promise<string> {
  const a = await askHidden("パスワード (10 文字以上): ");
  if (a.length < 10) throw new Error("パスワードが短すぎます");
  if (!process.env.HCU_PASSWORD) {
    const b = await askHidden("もう一度: ");
    if (a !== b) throw new Error("一致しません");
  }
  return a;
}

const [cmd, name] = process.argv.slice(2);
try {
  switch (cmd) {
    case "add": {
      if (!name) throw new Error("ユーザー名を指定してください");
      db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)").run(name, hashPassword(await newPassword()));
      console.log(`✔ ${name} を作成しました`);
      break;
    }
    case "passwd": {
      const r = db.prepare("UPDATE users SET password_hash = ? WHERE username = ?").run(hashPassword(await newPassword()), name);
      if (!r.changes) throw new Error("ユーザーが見つかりません");
      db.prepare("DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE username = ?)").run(name);
      console.log(`✔ ${name} のパスワードを変更し、全セッションを無効化しました`);
      break;
    }
    case "reset-2fa": {
      const r = db.prepare("UPDATE users SET totp_secret = NULL, totp_pending = NULL WHERE username = ?").run(name);
      console.log(r.changes ? `✔ ${name} の 2FA を解除しました` : "ユーザーが見つかりません");
      break;
    }
    case "del": {
      const r = db.prepare("DELETE FROM users WHERE username = ?").run(name);
      console.log(r.changes ? `✔ ${name} を削除しました` : "ユーザーが見つかりません");
      break;
    }
    case "list": {
      const rows = db.prepare("SELECT username, totp_secret IS NOT NULL AS totp, datetime(created_at, 'unixepoch') AS created FROM users").all();
      console.table(rows);
      break;
    }
    default:
      console.log("usage: npm run user -- <add|passwd|reset-2fa|del|list> [username]");
  }
} catch (e) {
  console.error("✖", (e as Error).message);
  process.exit(1);
}
