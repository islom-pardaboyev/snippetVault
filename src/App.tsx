import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./hooks/auth";
import { SnippetsProvider } from "./hooks/snippets";
import { useOnline } from "./hooks/ui";
import { Shell } from "./components/Shell";
import { LogoMark } from "./components/Logo";
import { Login } from "./pages/Login";
import { Library } from "./pages/Library";
import { Detail } from "./pages/Detail";
import { NotFound } from "./pages/NotFound";
import { Groups } from "./pages/Groups";
import { Offline } from "./pages/Offline";
import { InstallPrompt } from "./components/InstallPrompt";

const Editor = lazy(() => import("./pages/Editor").then((m) => ({ default: m.Editor })));
const Insights = lazy(() => import("./pages/Insights").then((m) => ({ default: m.Insights })));
const Fallback = () => <div className="skeleton mx-auto h-72 max-w-[1240px] rounded-card" />;

function Splash() {
  return (
    <div className="grid min-h-screen place-items-center">
      <div className="animate-[pulse-dot_1.2s_infinite]"><LogoMark size={48} /></div>
    </div>
  );
}

function Gate() {
  const { status } = useAuth();
  const online = useOnline();

  useEffect(() => { document.title = "SnippetVault"; }, []);

  const { pathname } = useLocation();
  const known = /^\/($|favorites$|insights$|groups$|new$|lang\/[^/]+$|tag\/[^/]+$|group\/[^/]+$|s\/[^/]+(\/edit)?$)/.test(pathname);

  if (status === "loading") return online ? <Splash /> : <Offline />;
  if (status === "out") {
    if (!online) return <Offline />;
    return known ? <><Login /><InstallPrompt /></> : <NotFound />;
  }

  return (
    <SnippetsProvider>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Library mode="all" />} />
          <Route path="favorites" element={<Library mode="favorites" />} />
          <Route path="lang/:lang" element={<Library mode="lang" />} />
          <Route path="tag/:tag" element={<Library mode="tag" />} />
          <Route path="groups" element={<Groups />} />
          <Route path="group/:group" element={<Library mode="group" />} />
          <Route path="new" element={<Suspense fallback={<Fallback />}><Editor /></Suspense>} />
          <Route path="s/:id" element={<Detail />} />
          <Route path="s/:id/edit" element={<Suspense fallback={<Fallback />}><Editor /></Suspense>} />
          <Route path="insights" element={<Suspense fallback={<Fallback />}><Insights /></Suspense>} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </SnippetsProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Gate />
    </BrowserRouter>
  );
}
