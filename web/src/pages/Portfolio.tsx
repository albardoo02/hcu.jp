import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowUpRight, BookMarked, Building2, Check, Clock, Copy, GitCommitHorizontal, GitFork, GitPullRequest,
  Github, Link2, LogIn, MapPin, CircleDot, Star, Users, LayoutDashboard, Sparkles, Gamepad2, CalendarDays,
} from "lucide-react";
import { api, type Me } from "../api";
import { Logo } from "../components/Logo";
import { ContributionArea, ContributionCalendar, CountUp, Donut, HourBars, useInView } from "../components/charts";

interface Repo {
  name: string; owner: string; description: string | null; url: string; stars: number; forks: number;
  language: { name: string; color: string } | null;
}
interface Lang { name: string; color: string; value: number }
interface Data {
  fetchedAt: string;
  profile: {
    login: string; name: string; avatar: string; url: string; bio: string | null; company: string | null;
    location: string | null; blog: string | null; twitter: string | null; createdAt: string;
    followers: number; following: number; publicRepos: number;
  };
  orgs: { login: string; name: string | null; avatar: string; url: string }[];
  stats: { stars: number; commits: number | null; prs: number | null; issues: number | null; contributedTo: number | null; contributions: number | null };
  calendar: { date: string; count: number }[] | null;
  langsByRepo: Lang[];
  langsByCommit: Lang[] | null;
  commitHours: number[] | null;
  commitSample: number;
  pinned: Repo[];
  org: { login: string; name: string; description: string | null; avatar: string; url: string; blog: string | null; publicRepos: number; topRepos: Repo[] } | null;
  about: string | null;
  promo: { title?: string; body?: string; address?: string; website?: string; discord?: string } | null;
  timezone: string;
}

export function Portfolio({ me }: { me: Me | null }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Data>("/api/public/portfolio").then(setData).catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <PublicHeader me={me} />
      <main className="mx-auto max-w-6xl px-5 pb-24 pt-8 sm:pt-12">
        {error && <p className="card p-6 text-center text-zinc-400">{error}</p>}
        {!data && !error && <Skeleton />}
        {data && (
          <div className="grid gap-8 lg:grid-cols-[280px_1fr] lg:gap-10">
            <Profile d={data} />
            <div className="min-w-0 space-y-6">
              <Overview d={data} />
              {data.calendar && (
                <Card title="Contribution Calendar" icon={<CalendarDays className="size-4" />} sub="過去 1 年">
                  <ContributionCalendar days={data.calendar} />
                </Card>
              )}
              <div className="grid gap-6 xl:grid-cols-2">
                <Card title="Top Languages by Repo" sub="公開リポジトリの主要言語">
                  <Donut data={data.langsByRepo} label="リポジトリ別の言語" />
                </Card>
                {data.langsByCommit && data.langsByCommit.length > 0 && (
                  <Card title="Top Languages by Commit" sub="過去 1 年のコミット">
                    <Donut data={data.langsByCommit} label="コミット別の言語" />
                  </Card>
                )}
              </div>
              <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
                <Stats d={data} />
                {data.commitHours && (
                  <Card title={`Commits by Hour`} sub={`${tzLabel(data.timezone)} · 直近 ${data.commitSample} コミット`}>
                    <HourBars hours={data.commitHours} />
                  </Card>
                )}
              </div>
              <Pinned repos={data.pinned} />
              {data.about && <About text={data.about} />}
            </div>
          </div>
        )}
        {data?.org && <Promo org={data.org} promo={data.promo} />}
      </main>
      <footer className="border-t border-white/5 py-10 text-center text-xs text-zinc-600">
        <p>© {new Date().getFullYear()} {data?.profile.login ?? "hcu.jp"} · hcu.jp</p>
        {data && <p className="mt-1">GitHub データ更新: {new Date(data.fetchedAt).toLocaleString("ja-JP")}</p>}
      </footer>
    </>
  );
}

const tzLabel = (tz: string) => {
  const off = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value;
  return off?.replace("GMT", "UTC") ?? tz;
};

/* ------------------------------------------------------------------ header */

function PublicHeader({ me }: { me: Me | null }) {
  const links = [["#stats", "Stats"], ["#projects", "Projects"], ["#azisaba", "Azisaba"]];
  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-ink-950/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5">
        <Logo />
        <nav className="hidden items-center gap-1 sm:flex">
          {links.map(([h, t]) => (
            <a key={h} href={h} className="rounded-lg px-3 py-1.5 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-white">{t}</a>
          ))}
        </nav>
        <div className="flex-1" />
        {me ? (
          <a href="/" className="btn-ghost py-2"><LayoutDashboard className="size-4" /> ダッシュボード</a>
        ) : (
          <a href="/login" className="btn-ghost py-2"><LogIn className="size-4" /> ログイン</a>
        )}
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ profile (左カラム) */

function Profile({ d }: { d: Data }) {
  const p = d.profile;
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(t); }, []);
  const time = now.toLocaleTimeString("ja-JP", { timeZone: d.timezone, hour: "2-digit", minute: "2-digit" });
  const blog = p.blog && (p.blog.startsWith("http") ? p.blog : `https://${p.blog}`);

  return (
    <aside className="rise lg:sticky lg:top-24 lg:self-start">
      <div className="flex items-center gap-5 lg:block">
        <div className="relative size-24 shrink-0 sm:size-28 lg:size-full lg:max-w-[280px]">
          <div className="avatar-ring absolute -inset-[3px] rounded-full" />
          <img src={p.avatar} alt="" className="relative aspect-square w-full rounded-full border-4 border-ink-950 object-cover" />
        </div>
        <div className="lg:mt-6">
          <h1 className="text-2xl font-bold tracking-tight text-white">{p.name}</h1>
          <p className="text-lg text-zinc-500">@{p.login}</p>
        </div>
      </div>
      {p.bio && <p className="mt-4 text-sm leading-relaxed text-zinc-300">{p.bio}</p>}

      <a href={p.url} target="_blank" rel="noopener noreferrer" className="btn-ghost mt-5 w-full">
        <Github className="size-4" /> GitHub でフォロー
      </a>

      <p className="mt-4 flex items-center gap-1.5 text-sm text-zinc-400">
        <Users className="size-4 text-zinc-500" />
        <b className="text-white">{p.followers}</b> followers · <b className="text-white">{p.following}</b> following
      </p>

      <ul className="mt-4 space-y-2 text-sm text-zinc-300">
        {p.company && <Meta icon={Building2}>{linkOrgs(p.company)}</Meta>}
        {p.location && <Meta icon={MapPin}>{p.location}</Meta>}
        <Meta icon={Clock}><span className="font-mono">{time}</span> <span className="text-zinc-500">({tzLabel(d.timezone)})</span></Meta>
        {blog && <Meta icon={Link2}><a href={blog} target="_blank" rel="noopener" className="hover:text-violet-300">{p.blog!.replace(/^https?:\/\//, "")}</a></Meta>}
        {p.twitter && (
          <Meta icon={XLogo}><a href={`https://x.com/${p.twitter}`} target="_blank" rel="noopener" className="hover:text-violet-300">@{p.twitter}</a></Meta>
        )}
      </ul>

      {d.orgs.length > 0 && (
        <div className="mt-6 border-t border-white/5 pt-5">
          <h2 className="text-sm font-semibold text-white">Organizations</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {d.orgs.map((o) => (
              <a key={o.login} href={o.url} target="_blank" rel="noopener" title={o.name ?? o.login}
                className="transition hover:-translate-y-0.5">
                <img src={o.avatar} alt={o.login} className="size-9 rounded-lg ring-1 ring-white/10" />
              </a>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

function linkOrgs(text: string): ReactNode {
  return text.split(/(@[A-Za-z0-9-]+)/).map((s, i) =>
    s.startsWith("@") ? <a key={i} href={`https://github.com/${s.slice(1)}`} target="_blank" rel="noopener" className="font-semibold hover:text-violet-300">{s}</a> : s,
  );
}

function XLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M18.9 2H22l-6.8 7.8L23 22h-6.2l-4.8-6.3L6.4 22H3.3l7.3-8.3L1 2h6.3l4.4 5.8L18.9 2Zm-1.1 18h1.7L6.3 3.9H4.5L17.8 20Z" />
    </svg>
  );
}

function Meta({ icon: I, children }: { icon: React.ComponentType<{ className?: string }>; children: ReactNode }) {
  return <li className="flex items-center gap-2.5"><I className="size-4 shrink-0 text-zinc-500" /><span className="min-w-0 truncate">{children}</span></li>;
}

/* ------------------------------------------------------------------ cards */

function Card({ title, sub, icon, children, id }: { title: string; sub?: string; icon?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="card rise scroll-mt-24 p-5 sm:p-6">
      <header className="mb-5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-white">{icon}{title}</h2>
        {sub && <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>}
      </header>
      {children}
    </section>
  );
}

function Overview({ d }: { d: Data }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  const years = Math.floor((Date.now() - Date.parse(d.profile.createdAt)) / (365.25 * 864e5));
  return (
    <section ref={ref} id="stats" className="card rise relative scroll-mt-24 overflow-hidden p-5 sm:p-6">
      <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-violet-600/15 blur-3xl" />
      <div className="relative grid gap-6 md:grid-cols-[minmax(0,220px)_1fr] md:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">GitHub Stats</p>
          {d.stats.contributions !== null && (
            <p className="mt-3">
              <span className="text-gradient font-mono text-5xl font-bold tabular-nums"><CountUp value={d.stats.contributions} start={seen} /></span>
              <span className="mt-1 block text-sm text-zinc-400">contributions in the last year</span>
            </p>
          )}
          <ul className="mt-5 space-y-2 text-sm text-zinc-300">
            <Meta icon={BookMarked}><b className="text-white">{d.profile.publicRepos}</b> public repos</Meta>
            <Meta icon={Clock}>Joined GitHub <b className="text-white">{years}</b> years ago</Meta>
            {d.profile.company && <Meta icon={Building2}>{linkOrgs(d.profile.company)}</Meta>}
          </ul>
        </div>
        {d.calendar ? <ContributionArea days={d.calendar} /> : <div className="h-8" />}
      </div>
    </section>
  );
}

function Stats({ d }: { d: Data }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  const rows = [
    [Star, "Total Stars", d.stats.stars],
    [GitCommitHorizontal, "Commits", d.stats.commits],
    [GitPullRequest, "PRs", d.stats.prs],
    [CircleDot, "Issues", d.stats.issues],
    [BookMarked, "Contributed", d.stats.contributedTo],
  ].filter((r) => r[2] !== null) as [typeof Star, string, number][];
  return (
    <section ref={ref} className="card rise p-5 sm:p-6">
      <h2 className="text-base font-semibold text-white">Stats</h2>
      <p className="mb-5 mt-0.5 text-xs text-zinc-500">過去 1 年 (Stars は累計)</p>
      <dl className="grid grid-cols-2 gap-3">
        {rows.map(([I, label, v], i) => (
          <div key={label} className={`rounded-xl border border-white/5 bg-white/[0.02] p-3.5 ${i === 0 && rows.length % 2 === 1 ? "col-span-2" : ""}`}>
            <dt className="flex items-center gap-1.5 text-xs text-zinc-500"><I className="size-3.5" />{label}</dt>
            <dd className="mt-1 font-mono text-2xl font-semibold tabular-nums text-white"><CountUp value={v} start={seen} /></dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function RepoCard({ r, showOwner }: { r: Repo; showOwner?: boolean }) {
  return (
    <a href={r.url} target="_blank" rel="noopener noreferrer" className="card card-hover group flex flex-col p-4">
      <span className="flex items-center gap-2">
        <BookMarked className="size-4 shrink-0 text-zinc-500" />
        <span className="truncate font-semibold text-violet-200 group-hover:text-white">
          {showOwner && <span className="font-normal text-zinc-500">{r.owner}/</span>}{r.name}
        </span>
        <ArrowUpRight className="ml-auto size-4 shrink-0 text-zinc-600 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white" />
      </span>
      <span className="mt-2 line-clamp-2 flex-1 text-sm text-zinc-500">{r.description ?? "—"}</span>
      <span className="mt-3 flex items-center gap-4 text-xs text-zinc-500">
        {r.language && (
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: r.language.color }} />{r.language.name}</span>
        )}
        {r.stars > 0 && <span className="flex items-center gap-1"><Star className="size-3.5" />{r.stars}</span>}
        {r.forks > 0 && <span className="flex items-center gap-1"><GitFork className="size-3.5" />{r.forks}</span>}
      </span>
    </a>
  );
}

function Pinned({ repos }: { repos: Repo[] }) {
  if (!repos.length) return null;
  return (
    <section id="projects" className="rise scroll-mt-24">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-zinc-400">Projects</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {repos.map((r) => <RepoCard key={r.url} r={r} showOwner={false} />)}
      </div>
    </section>
  );
}

function About({ text }: { text: string }) {
  return (
    <Card title="自己紹介" icon={<Sparkles className="size-4 text-violet-300" />}>
      <div className="space-y-2 text-sm leading-relaxed text-zinc-300">
        {text.trim().split("\n").map((l, i) => <p key={i}>{l}</p>)}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ AzisabaNetwork 宣伝 */

function Promo({ org, promo }: { org: NonNullable<Data["org"]>; promo: Data["promo"] }) {
  const [ref, seen] = useInView<HTMLElement>();
  const [copied, setCopied] = useState(false);
  const website = promo?.website ?? org.blog;

  async function copy() {
    if (!promo?.address) return;
    try { await navigator.clipboard.writeText(promo.address); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  }

  return (
    <section ref={ref} id="azisaba" className="rise relative mt-16 scroll-mt-24 overflow-hidden rounded-3xl border border-white/10 p-6 sm:p-10">
      <div className="promo-bg absolute inset-0 -z-10" />
      <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <div>
          <div className="flex items-center gap-3">
            <img src={org.avatar} alt="" className="size-14 rounded-2xl ring-1 ring-white/15" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/80">Member of</p>
              <p className="text-xl font-bold text-white">{org.name}</p>
            </div>
          </div>
          <h2 className="mt-6 text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl">
            {promo?.title ?? org.name}
          </h2>
          <div className="mt-4 space-y-1.5 text-zinc-300">
            {(promo?.body ?? org.description ?? "").trim().split("\n").map((l, i) => <p key={i}>{l}</p>)}
          </div>

          {promo?.address && (
            <button onClick={copy}
              className="group mt-6 flex w-full max-w-sm items-center gap-3 rounded-2xl border border-emerald-400/20 bg-black/30 p-3 pl-4 text-left transition hover:border-emerald-400/40">
              <Gamepad2 className="size-5 shrink-0 text-emerald-300" />
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] text-zinc-500">サーバーアドレス (Java Edition)</span>
                <span className="block truncate font-mono text-lg font-semibold text-white">{promo.address}</span>
              </span>
              <span className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${copied ? "bg-emerald-400/20 text-emerald-200" : "bg-white/5 text-zinc-400 group-hover:text-white"}`}>
                {copied ? <><Check className="size-3.5" />コピー済</> : <><Copy className="size-3.5" />コピー</>}
              </span>
            </button>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            {website && <a href={website} target="_blank" rel="noopener" className="btn bg-emerald-500 text-ink-950 hover:bg-emerald-400">公式サイト <ArrowUpRight className="size-4" /></a>}
            {promo?.discord && <a href={promo.discord} target="_blank" rel="noopener" className="btn-ghost">Discord</a>}
            <a href={org.url} target="_blank" rel="noopener" className="btn-ghost"><Github className="size-4" /> GitHub</a>
          </div>
        </div>

        <div>
          <div className="mb-4 flex items-baseline gap-2">
            <span className="font-mono text-4xl font-bold tabular-nums text-white"><CountUp value={org.publicRepos} start={seen} /></span>
            <span className="text-sm text-zinc-400">public repositories</span>
          </div>
          <div className="grid gap-3">
            {org.topRepos.slice(0, 4).map((r) => <RepoCard key={r.url} r={r} />)}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ skeleton */

function Skeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
      <div className="space-y-4">
        <div className="aspect-square w-28 animate-pulse rounded-full bg-white/5 lg:w-full" />
        <div className="h-6 w-40 animate-pulse rounded bg-white/5" />
      </div>
      <div className="space-y-6">
        {[260, 160, 240].map((h) => <div key={h} className="card animate-pulse" style={{ height: h }} />)}
      </div>
    </div>
  );
}
