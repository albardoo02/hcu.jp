import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { config } from "./config.ts";

/**
 * ポートフォリオ用の GitHub データ。
 * GITHUB_TOKEN があれば GraphQL でコントリビューション等も取得、無ければ REST の公開情報のみ。
 * 結果は 1 時間キャッシュし、data/github-cache.json にも保存する (再起動直後も即表示)。
 */

const TOKEN = process.env.GITHUB_TOKEN;
const TTL = 60 * 60_000;
const CACHE_FILE = resolve(process.env.HCU_GITHUB_CACHE ?? "data/github-cache.json");

export interface Lang { name: string; color: string; value: number }
export interface Repo {
  name: string; owner: string; description: string | null; url: string;
  stars: number; forks: number; language: { name: string; color: string } | null;
}
export interface Portfolio {
  fetchedAt: string;
  /** 取得中に起きた問題 (ログ・診断用) */
  warnings?: string[];
  hasToken: boolean;
  profile: {
    login: string; name: string; avatar: string; url: string; bio: string | null;
    company: string | null; location: string | null; blog: string | null; twitter: string | null;
    createdAt: string; followers: number; following: number; publicRepos: number;
  };
  orgs: { login: string; name: string | null; avatar: string; url: string }[];
  stats: {
    stars: number; commits: number | null; prs: number | null; issues: number | null;
    contributedTo: number | null; contributions: number | null;
  };
  calendar: { date: string; count: number }[] | null;
  langsByRepo: Lang[];
  langsByCommit: Lang[] | null;
  commitHours: number[] | null;
  commitSample: number;
  pinned: Repo[];
  org: {
    login: string; name: string; description: string | null; avatar: string; url: string;
    blog: string | null; publicRepos: number; topRepos: Repo[];
  } | null;
}

// GraphQL が使えないとき用の、主要言語の色 (GitHub linguist 準拠)
const LANG_COLORS: Record<string, string> = {
  Java: "#b07219", Kotlin: "#A97BFF", Python: "#3572A5", "Jupyter Notebook": "#DA5B0B", PHP: "#4F5D95",
  TypeScript: "#3178c6", JavaScript: "#f1e05a", Shell: "#89e051", Vue: "#41b883", HTML: "#e34c26",
  CSS: "#563d7c", Go: "#00ADD8", Rust: "#dea584", C: "#555555", "C++": "#f34b7d", "C#": "#178600",
  Ruby: "#701516", Dockerfile: "#384d54", Lua: "#000080", Swift: "#F05138", Dart: "#00B4AB",
};
const color = (name: string, c?: string | null) => c ?? LANG_COLORS[name] ?? "#8b8b9a";

let warnings: string[] = [];
function warn(m: string) { warnings.push(m); console.warn("[github]", m); }

async function gh<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "hcu-portal",
      ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    const reset = res.headers.get("x-ratelimit-remaining") === "0" ? ` (レート制限: ${new Date(Number(res.headers.get("x-ratelimit-reset")) * 1000).toLocaleTimeString("ja-JP")} に解除)` : "";
    throw new Error(`${path.split("?")[0]} → ${res.status} ${body.message ?? ""}${reset}`);
  }
  return res.json() as Promise<T>;
}

async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json", "user-agent": "hcu-portal" },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: T; errors?: { message: string; path?: string[] }[]; message?: string };
  const msg = json.errors?.map((e) => `${e.path?.join(".") ?? ""} ${e.message}`.trim()).join(" / ") ?? json.message ?? `HTTP ${res.status}`;
  if (!res.ok || !json.data) throw new Error(`GraphQL: ${msg}`);
  // fine-grained token では一部フィールドだけ権限エラーになることがある → 取れた分は使う
  if (json.errors) { warn(`GraphQL 一部失敗: ${msg}`); }
  return json.data;
}

const USER_QUERY = `
query($login: String!) {
  user(login: $login) {
    login name avatarUrl url bio company location websiteUrl twitterUsername createdAt
    followers { totalCount }
    following { totalCount }
    repositories(first: 100, ownerAffiliations: OWNER, privacy: PUBLIC, orderBy: {field: PUSHED_AT, direction: DESC}) {
      totalCount
      nodes { name isFork stargazerCount primaryLanguage { name color } }
    }
    pinnedItems(first: 6, types: REPOSITORY) {
      nodes { ... on Repository { name description url stargazerCount forkCount owner { login } primaryLanguage { name color } } }
    }
    organizations(first: 20) { nodes { login name avatarUrl url } }
    repositoriesContributedTo(first: 1, contributionTypes: [COMMIT, PULL_REQUEST, ISSUE, REPOSITORY], includeUserRepositories: false) { totalCount }
    contributionsCollection {
      totalCommitContributions restrictedContributionsCount
      totalPullRequestContributions totalIssueContributions
      contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } }
      commitContributionsByRepository(maxRepositories: 100) {
        repository { primaryLanguage { name color } }
        contributions { totalCount }
      }
    }
  }
}`;

interface GqlUser {
  user: {
    login: string; name: string | null; avatarUrl: string; url: string; bio: string | null; company: string | null;
    location: string | null; websiteUrl: string | null; twitterUsername: string | null; createdAt: string;
    followers: { totalCount: number }; following: { totalCount: number };
    repositories: { totalCount: number; nodes: { name: string; isFork: boolean; stargazerCount: number; primaryLanguage: { name: string; color: string } | null }[] };
    pinnedItems: { nodes: { name: string; description: string | null; url: string; stargazerCount: number; forkCount: number; owner: { login: string }; primaryLanguage: { name: string; color: string } | null }[] };
    organizations: { nodes: { login: string; name: string | null; avatarUrl: string; url: string }[] };
    repositoriesContributedTo: { totalCount: number };
    contributionsCollection: {
      totalCommitContributions: number; restrictedContributionsCount: number;
      totalPullRequestContributions: number; totalIssueContributions: number;
      contributionCalendar: { totalContributions: number; weeks: { contributionDays: { date: string; contributionCount: number }[] }[] };
      commitContributionsByRepository: { repository: { primaryLanguage: { name: string; color: string } | null }; contributions: { totalCount: number } }[];
    };
  };
}

interface RestRepo {
  name: string; owner: { login: string }; description: string | null; html_url: string; fork: boolean;
  stargazers_count: number; forks_count: number; language: string | null; pushed_at: string;
}

const toRepo = (r: RestRepo): Repo => ({
  name: r.name, owner: r.owner.login, description: r.description, url: r.html_url,
  stars: r.stargazers_count, forks: r.forks_count,
  language: r.language ? { name: r.language, color: color(r.language) } : null,
});

/** 上位 5 言語 + その他 (カテゴリ色は 6 色まで) */
function topLangs(counts: Map<string, { color: string; value: number }>): Lang[] {
  const all = [...counts].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.value - a.value);
  const top = all.slice(0, 5);
  const rest = all.slice(5).reduce((s, l) => s + l.value, 0);
  if (rest > 0) top.push({ name: "Other", color: "#6b6b7b", value: rest });
  return top;
}

/** 直近のコミット (最大 300 件) を時間帯別に集計 */
async function commitHours(login: string): Promise<{ hours: number[]; sample: number } | null> {
  const tz = config.portfolio.timezone;
  const fmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: tz });
  const hours = Array(24).fill(0);
  let sample = 0;
  try {
    for (let page = 1; page <= 3; page++) {
      const r = await gh<{ items: { commit: { author: { date: string } } }[] }>(
        `/search/commits?q=author:${encodeURIComponent(login)}&sort=author-date&order=desc&per_page=100&page=${page}`,
      );
      for (const it of r.items) {
        hours[Number(fmt.format(new Date(it.commit.author.date)))]++;
        sample++;
      }
      if (r.items.length < 100) break;
    }
    return { hours, sample };
  } catch (e) {
    warn(`コミット時間帯の取得に失敗: ${(e as Error).message}`);
    return sample ? { hours, sample } : null;
  }
}

async function fetchOrg(login: string): Promise<Portfolio["org"]> {
  let o: { login: string; name: string | null; description: string | null; avatar_url: string; html_url: string; blog: string | null; public_repos: number };
  try {
    o = await gh(`/orgs/${login}`);
  } catch (e) {
    warn(`組織 ${login} の取得に失敗: ${(e as Error).message}`);
    return null;
  }
  let top: Repo[] = [];
  try {
    top = (await gh<{ items: RestRepo[] }>(`/search/repositories?q=org:${login}&sort=stars&order=desc&per_page=6`)).items.map(toRepo);
  } catch (e) {
    warn(`組織リポジトリ検索に失敗 (${(e as Error).message}) → 最近更新順で代用`);
    try {
      const repos = await gh<RestRepo[]>(`/orgs/${login}/repos?sort=pushed&per_page=30`);
      top = repos.sort((a, b) => b.stargazers_count - a.stargazers_count).slice(0, 6).map(toRepo);
    } catch (e2) { warn(`組織リポジトリ一覧も失敗: ${(e2 as Error).message}`); }
  }
  return {
    login: o.login, name: o.name ?? o.login, description: o.description, avatar: o.avatar_url,
    url: o.html_url, blog: o.blog || null, publicRepos: o.public_repos, topRepos: top,
  };
}

async function fetchWithToken(login: string): Promise<Omit<Portfolio, "fetchedAt" | "org" | "commitHours" | "commitSample">> {
  const { user: u } = await graphql<GqlUser>(USER_QUERY, { login });
  if (!u) throw new Error("GraphQL: user が取得できません");
  const cc = u.contributionsCollection;
  if (!cc) throw new Error("GraphQL: contributionsCollection が取得できません");
  u.repositories ??= { totalCount: 0, nodes: [] };
  u.pinnedItems ??= { nodes: [] };
  u.organizations ??= { nodes: [] };

  const byRepo = new Map<string, { color: string; value: number }>();
  for (const r of u.repositories.nodes) {
    if (r.isFork || !r.primaryLanguage) continue;
    const e = byRepo.get(r.primaryLanguage.name) ?? { color: color(r.primaryLanguage.name, r.primaryLanguage.color), value: 0 };
    e.value++;
    byRepo.set(r.primaryLanguage.name, e);
  }
  const byCommit = new Map<string, { color: string; value: number }>();
  for (const c of cc.commitContributionsByRepository) {
    const l = c.repository.primaryLanguage;
    if (!l) continue;
    const e = byCommit.get(l.name) ?? { color: color(l.name, l.color), value: 0 };
    e.value += c.contributions.totalCount;
    byCommit.set(l.name, e);
  }

  return {
    hasToken: true,
    profile: {
      login: u.login, name: u.name ?? u.login, avatar: u.avatarUrl, url: u.url, bio: u.bio, company: u.company,
      location: u.location, blog: u.websiteUrl, twitter: u.twitterUsername, createdAt: u.createdAt,
      followers: u.followers.totalCount, following: u.following.totalCount, publicRepos: u.repositories.totalCount,
    },
    orgs: u.organizations.nodes.map((o) => ({ login: o.login, name: o.name, avatar: o.avatarUrl, url: o.url })),
    stats: {
      stars: u.repositories.nodes.reduce((s, r) => s + r.stargazerCount, 0),
      commits: cc.totalCommitContributions + cc.restrictedContributionsCount,
      prs: cc.totalPullRequestContributions,
      issues: cc.totalIssueContributions,
      contributedTo: u.repositoriesContributedTo?.totalCount ?? null,
      contributions: cc.contributionCalendar.totalContributions,
    },
    calendar: cc.contributionCalendar.weeks.flatMap((w) => w.contributionDays.map((d) => ({ date: d.date, count: d.contributionCount }))),
    langsByRepo: topLangs(byRepo),
    langsByCommit: topLangs(byCommit),
    pinned: u.pinnedItems.nodes.filter(Boolean).map((r) => ({
      name: r.name, owner: r.owner.login, description: r.description, url: r.url, stars: r.stargazerCount,
      forks: r.forkCount, language: r.primaryLanguage ? { name: r.primaryLanguage.name, color: color(r.primaryLanguage.name, r.primaryLanguage.color) } : null,
    })),
  };
}

async function fetchPublic(login: string): Promise<Omit<Portfolio, "fetchedAt" | "org" | "commitHours" | "commitSample">> {
  const [u, repos, orgs] = await Promise.all([
    gh<{ login: string; name: string | null; avatar_url: string; html_url: string; bio: string | null; company: string | null; location: string | null; blog: string | null; twitter_username: string | null; created_at: string; followers: number; following: number; public_repos: number }>(`/users/${login}`),
    gh<RestRepo[]>(`/users/${login}/repos?per_page=100&sort=pushed`),
    gh<{ login: string; avatar_url: string }[]>(`/users/${login}/orgs`),
  ]);
  const byRepo = new Map<string, { color: string; value: number }>();
  for (const r of repos) {
    if (r.fork || !r.language) continue;
    const e = byRepo.get(r.language) ?? { color: color(r.language), value: 0 };
    e.value++;
    byRepo.set(r.language, e);
  }
  const own = repos.filter((r) => !r.fork);
  return {
    hasToken: false,
    profile: {
      login: u.login, name: u.name ?? u.login, avatar: u.avatar_url, url: u.html_url, bio: u.bio, company: u.company,
      location: u.location, blog: u.blog || null, twitter: u.twitter_username, createdAt: u.created_at,
      followers: u.followers, following: u.following, publicRepos: u.public_repos,
    },
    orgs: orgs.map((o) => ({ login: o.login, name: null, avatar: o.avatar_url, url: `https://github.com/${o.login}` })),
    stats: { stars: repos.reduce((s, r) => s + r.stargazers_count, 0), commits: null, prs: null, issues: null, contributedTo: null, contributions: null },
    calendar: null,
    langsByRepo: topLangs(byRepo),
    langsByCommit: null,
    pinned: [...own].sort((a, b) => b.stargazers_count - a.stargazers_count || b.pushed_at.localeCompare(a.pushed_at)).slice(0, 6).map(toRepo),
  };
}

let cache: Portfolio | null = (() => {
  try { return existsSync(CACHE_FILE) ? (JSON.parse(readFileSync(CACHE_FILE, "utf8")) as Portfolio) : null; } catch { return null; }
})();
let inflight: Promise<Portfolio> | null = null;

async function refresh(): Promise<Portfolio> {
  const login = config.portfolio.github;
  warnings = [];
  if (!TOKEN) warn("GITHUB_TOKEN 未設定 → 公開情報のみ表示");
  const [main, hours, org] = await Promise.all([
    TOKEN ? fetchWithToken(login).catch((e) => { warn(`${e.message} → REST にフォールバック`); return fetchPublic(login); }) : fetchPublic(login),
    commitHours(login),
    config.portfolio.org ? fetchOrg(config.portfolio.org) : Promise.resolve(null),
  ]);
  if (config.portfolio.org && !org) warn("組織情報なし → 宣伝セクションは非表示");
  const data: Portfolio = { ...main, fetchedAt: new Date().toISOString(), warnings: [...warnings], commitHours: hours?.hours ?? null, commitSample: hours?.sample ?? 0, org };
  cache = data;
  try {
    mkdirSync(dirname(CACHE_FILE), { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(data));
  } catch {}
  return data;
}

/** キャッシュを即返し、古ければ裏で更新 (stale-while-revalidate) */
export const refreshPortfolio = refresh;

export async function getPortfolio(): Promise<Portfolio> {
  // 何か失敗していたら 5 分後に再取得 (トークン未設定の警告だけなら通常どおり)
  const partial = cache?.warnings?.some((w) => !w.startsWith("GITHUB_TOKEN 未設定"));
  const stale = !cache || Date.now() - Date.parse(cache.fetchedAt) > (partial ? 5 * 60_000 : TTL);
  if (stale && !inflight) inflight = refresh().finally(() => { inflight = null; });
  if (cache) {
    inflight?.catch((e) => console.warn("[github] refresh failed:", e.message));
    return cache;
  }
  return inflight!;
}
