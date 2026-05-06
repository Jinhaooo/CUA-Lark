/**
 * Embedded dashboard page. Hosts the @cua-lark/dashboard SPA inside an iframe.
 *
 * Why iframe and not vendor the dashboard React tree directly?
 *  - Dashboard is its own pnpm workspace with its own vite + tailwind +
 *    react-router setup. Vendoring would entangle two build pipelines.
 *  - Both surfaces talk to the same backend SSE / HTTP, so live data already
 *    syncs naturally — no extra plumbing required.
 *  - In dev the dashboard runs on :5174 with /api proxy to :7878. In prod
 *    it's served at /dashboard/ by @fastify/static.
 */
import { ChevronLeft, ExternalLink, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@renderer/components/ui/button';
import { api } from '../../api';

// Dev-first ordering: in `pnpm dev` the dashboard vite server is auto-spawned
// on :5174 and is the source of truth. The :7878/dashboard/ path is only
// meaningful in packaged builds where @fastify/static serves the built SPA.
// Use 127.0.0.1 explicitly + localhost form: Electron's renderer fetch on
// Windows can resolve `localhost` to ::1 while vite may bind to one stack
// only, which produces intermittent connection-refused.
// Dev only for now: the auto-spawned vite dev server at :5174 is the source
// of truth. The packaged @fastify/static path under :7878/dashboard/ is
// disabled until we wire a fresh dashboard prod build into CI — otherwise it
// happily serves a stale 468-byte HTML shell whose JS bundles 404.
const URL_CANDIDATES = [
  'http://127.0.0.1:5174/',
  'http://localhost:5174/',
];

const DashboardPage = () => {
  const navigate = useNavigate();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [showStaleBanner, setShowStaleBanner] = useState(false);
  // Ref mirrors `loaded` so the 4 s timeout below sees the live value
  // instead of a stale closure capture (the bug that produced the false
  // "Dashboard 加载较慢或失败" banner even after onLoad fired).
  const loadedRef = useRef(false);

  const src = URL_CANDIDATES[candidateIndex] ?? URL_CANDIDATES[0]!;

  // 4-second watchdog: if the iframe never fires `load`, surface a banner
  // with troubleshooting tips. Cross-origin iframes don't reliably fire
  // `onError` for connection-refused, so a timeout is the only signal.
  useEffect(() => {
    loadedRef.current = false;
    setLoaded(false);
    setShowStaleBanner(false);
    const timer = setTimeout(() => {
      if (!loadedRef.current) setShowStaleBanner(true);
    }, 4000);
    return () => clearTimeout(timer);
  }, [src]);

  const handleIframeLoad = () => {
    loadedRef.current = true;
    setLoaded(true);
    setShowStaleBanner(false);
  };

  const handleIframeError = () => {
    // Try the next candidate URL.
    if (candidateIndex < URL_CANDIDATES.length - 1) {
      setCandidateIndex(candidateIndex + 1);
    } else {
      setShowStaleBanner(true);
    }
  };

  const handleRetry = useCallback(() => {
    loadedRef.current = false;
    setCandidateIndex(0);
    setLoaded(false);
    setShowStaleBanner(false);
    if (iframeRef.current) {
      // Bump src to bust any cached failure state.
      iframeRef.current.src = URL_CANDIDATES[0]!;
    }
  }, []);

  const handleOpenExternal = () => {
    void api.openExternal({ url: src });
  };

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  return (
    <div className="flex flex-col w-full h-full">
      <div className="pl-4 pr-5 py-3 flex items-center gap-2 draggable-area border-b">
        <Button
          variant="ghost"
          size="sm"
          className="!pl-0"
          style={{ ['-webkit-app-region' as never]: 'no-drag' } as React.CSSProperties}
          onClick={handleBack}
        >
          <ChevronLeft strokeWidth={2} className="!h-5 !w-5" />
          <span className="font-semibold">Dashboard</span>
        </Button>
        <div className="flex-1 flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRetry}
            title="重新加载"
            style={{ ['-webkit-app-region' as never]: 'no-drag' } as React.CSSProperties}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenExternal}
            title="在系统浏览器中打开 Dashboard"
            style={{ ['-webkit-app-region' as never]: 'no-drag' } as React.CSSProperties}
          >
            <ExternalLink className="h-4 w-4" />
            浏览器打开
          </Button>
        </div>
      </div>

      {showStaleBanner && (
        <div className="px-4 py-2 text-xs text-orange-700 bg-orange-50 border-b flex items-center justify-between">
          <span>
            Dashboard 加载较慢或失败（{src}）。如果是 dev 模式，请确认 backend :7878
            已启动，必要时手动运行 <code>pnpm --filter @cua-lark/dashboard dev</code>。
          </span>
          <Button variant="ghost" size="sm" onClick={handleRetry}>
            <RefreshCw className="h-3 w-3 mr-1" />
            重试
          </Button>
        </div>
      )}

      <div className="flex-1 min-h-0 relative">
        <iframe
          // key forces a fresh mount when src changes, bypassing iframe cache.
          key={src}
          ref={iframeRef}
          src={src}
          title="cua-lark dashboard"
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          onLoad={handleIframeLoad}
          onError={handleIframeError}
        />
        {!loaded && !showStaleBanner && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 pointer-events-none">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardPage;
