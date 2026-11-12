import { useCallback, useEffect, useState } from "react";
import { api, ApiError, navigate, type Me } from "./api";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Settings } from "./pages/Settings";

function usePath() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const on = () => setPath(location.pathname);
    addEventListener("popstate", on);
    return () => removeEventListener("popstate", on);
  }, []);
  return path;
}

export function App() {
  const path = usePath();
  const [me, setMe] = useState<Me | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      setMe(await api<Me>("/api/me"));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setMe(null);
      else throw e;
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (me === null && path !== "/login") {
      const next = location.pathname + location.search;
      navigate(next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`);
    }
    if (me && path === "/login") navigate("/");
  }, [me, path]);

  useEffect(() => {
    document.title = path === "/settings" ? "設定 — hcu.jp" : path === "/login" ? "ログイン — hcu.jp" : "hcu.jp";
  }, [path]);

  if (me === undefined) return <Splash />;
  if (!me || path === "/login") return <Login onLogin={refresh} />;
  if (path === "/settings") return <Settings me={me} onChange={refresh} />;
  return <Dashboard me={me} />;
}

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="size-8 animate-spin rounded-full border-2 border-violet-400/30 border-t-violet-300" />
    </div>
  );
}
