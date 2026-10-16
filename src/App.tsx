import { lazy, Suspense, useEffect, useRef } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./hooks/auth";
import { useAppLock } from "./hooks/applock";
import { SnippetsProvider } from "./hooks/snippets";
import { VaultProvider } from "./hooks/vault";
import { useOnline, useToast } from "./hooks/ui";
import { Shell } from "./components/Shell";
import { LogoMark } from "./components/Logo";
import { Library } from "./pages/Library";
import { NotFound } from "./pages/NotFound";
import { Offline } from "./pages/Offline";
import { InstallPrompt } from "./components/InstallPrompt";
import { LockScreen } from "./components/LockScreen";

const Editor = lazy(() => import("./pages/Editor").then((m) => ({ default: m.Editor })));
const Insights = lazy(() => import("./pages/Insights").then((m) => ({ default: m.Insights })));
const Detail = lazy(() => import("./pages/Detail").then((m) => ({ default: m.Detail })));
const Login = lazy(() => import("./pages/Login").then((m) => ({ default: m.Login })));
const Groups = lazy(() => import("./pages/Groups").then((m) => ({ default: m.Groups })));
const SharedSnippets = lazy(() => import("./pages/SharedSnippets").then((m) => ({ default: m.SharedSnippets })));
const Admin = lazy(() => import("./pages/Admin").then((m) => ({ default: m.Admin })));
const Shared = lazy(() => import("./pages/Shared").then((m) => ({ default: m.Shared })));
const VaultPage = lazy(() => import("./pages/Vault").then((m) => ({ default: m.Vault })));
const VaultDetailPage = lazy(() => import("./pages/Vault").then((m) => ({ default: m.VaultDetail })));
const Privacy = lazy(() => import("./pages/Legal").then((m) => ({ default: m.Privacy })));
const Terms = lazy(() => import("./pages/Legal").then((m) => ({ default: m.Terms })));

const Fallback = () => <div className="skeleton mx-auto h-72 max-w-[1240px] rounded-card" />;
const Page = ({ C }: { C: React.ComponentType }) => (
  <Suspense fallback={<Fallback />}><C /></Suspense>
);

function Splash() {
  return (
    <div className="grid min-h-screen place-items-center">
      <div className="animate-[pulse-dot_1.2s_infinite]"><LogoMark size={48} /></div>
    </div>
  );
}

function Gate() {
  const { status } = useAuth();
  const { enabled: lockEnabled, locked } = useAppLock();
  const online = useOnline();

  useEffect(() => { document.title = "SnippetVault"; }, []);

  const { pathname } = useLocation();
  const known = /^\/($|favorites$|insights$|groups$|shared$|vault$|vault\/[^/]+$|new$|lang\/[^/]+$|tag\/[^/]+$|group\/[^/]+$|s\/[^/]+(\/edit)?$|admin$)/.test(pathname);

  if (status === "loading") return online ? <Splash /> : <Offline />;
  if (status === "out") {
    if (!online) return <Offline />;
    return known ? <><Page C={Login} /><InstallPrompt /></> : <NotFound />;
  }

  if (lockEnabled && locked) return <LockScreen />;

  return (
    <SnippetsProvider>
      <VaultProvider>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Library mode="all" />} />
            <Route path="favorites" element={<Library mode="favorites" />} />
            <Route path="lang/:lang" element={<Library mode="lang" />} />
            <Route path="tag/:tag" element={<Library mode="tag" />} />
            <Route path="groups" element={<Page C={Groups} />} />
            <Route path="shared" element={<Page C={SharedSnippets} />} />
            <Route path="vault" element={<Page C={VaultPage} />} />
            <Route path="vault/:id" element={<Page C={VaultDetailPage} />} />
            <Route path="group/:group" element={<Library mode="group" />} />
            <Route path="new" element={<Suspense fallback={<Fallback />}><Editor /></Suspense>} />
            <Route path="s/:id" element={<Page C={Detail} />} />
            <Route path="s/:id/edit" element={<Suspense fallback={<Fallback />}><Editor /></Suspense>} />
            <Route path="admin" element={<Page C={Admin} />} />
            <Route path="insights" element={<Suspense fallback={<Fallback />}><Insights /></Suspense>} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </VaultProvider>
    </SnippetsProvider>
  );
}

/**
 * PWA update notice. The service worker updates itself (auto-update mode: skipWaiting +
 * clientsClaim), but the open page keeps running the old bundle until it reloads — so offer a
 * *user-triggered* reload instead of yanking the page out from under someone mid-edit. The very
 * first install claims the page too; that's not an update, so it's filtered out.
 */
function SWUpdateNotice() {
  const toast = useToast();
  const shown = useRef(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const sw = navigator.serviceWorker;
    let controlled = !!sw.controller;
    let pending = false;

    const show = () => {
      if (shown.current) return;
      shown.current = true;
      toast("A new version of SnippetVault is ready.", {
        action: { label: "Reload", run: () => location.reload() },
        ms: 30_000,
      });
    };
    const onChange = () => {
      if (!controlled) { controlled = true; return; } // initial claim, not an update
      if (document.visibilityState === "visible") show();
      else pending = true; // mobile tabs are backgrounded — offer it when they return
    };
    const onVis = () => {
      if (pending && document.visibilityState === "visible") { pending = false; show(); }
    };

    sw.addEventListener("controllerchange", onChange);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      sw.removeEventListener("controllerchange", onChange);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [toast]);

  return null;
}

function Root() {
  const { pathname } = useLocation();
  // Public routes rendered outside the auth gate: share links and the legal pages
  // (a logged-out visitor must be able to read the terms before signing up).
  if (/^\/share\//.test(pathname) || pathname === "/privacy" || pathname === "/terms") {
    return (
      <Routes>
        <Route path="/share/:token" element={<Page C={Shared} />} />
        <Route path="/privacy" element={<Page C={Privacy} />} />
        <Route path="/terms" element={<Page C={Terms} />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    );
  }
  return <Gate />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Root />
      <SWUpdateNotice />
    </BrowserRouter>
  );
}
