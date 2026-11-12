// GitHub 連携の診断:  npm run github:check   (Docker: docker compose exec hcu npx tsx server/github-check.ts)
import { config } from "./config.ts";
import { refreshPortfolio } from "./github.ts";

console.log(`GitHub ユーザー: ${config.portfolio.github} / 宣伝する組織: ${config.portfolio.org ?? "(未設定)"}`);
console.log(`GITHUB_TOKEN: ${process.env.GITHUB_TOKEN ? `設定済み (${process.env.GITHUB_TOKEN.slice(0, 11)}…)` : "未設定"}\n`);

const d = await refreshPortfolio();
const ok = (b: unknown) => (b ? "✔" : "✖");
console.log(`${ok(d.hasToken)} トークンで詳細データ取得 (コントリビューション・カレンダー・PR 等)`);
console.log(`${ok(d.calendar)} コントリビューションカレンダー`);
console.log(`${ok(d.langsByCommit)} コミット別の言語`);
console.log(`${ok(d.commitHours)} 時間帯別コミット (${d.commitSample} 件)`);
console.log(`${ok(d.org)} 組織の宣伝セクション${d.org ? ` (${d.org.name}, 人気リポジトリ ${d.org.topRepos.length} 件)` : ""}`);
if (d.warnings?.length) {
  console.log("\n問題:");
  for (const w of d.warnings) console.log("  -", w);
}
console.log("\nキャッシュを更新しました。サーバを再起動するとこの結果が表示されます。");
