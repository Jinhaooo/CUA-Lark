import { Outlet, useNavigate } from 'react-router';
import { useEffect, useState } from 'react';
import { Minimize2 } from 'lucide-react';

import { AppSidebar } from '@/renderer/src/components/SideBar/app-sidebar';
import { SidebarInset, SidebarProvider } from '@renderer/components/ui/sidebar';
import { Button } from '@renderer/components/ui/button';
import {
  CUA_ENTRY_MODE_EVENT,
  getCuaEntryMode,
  setCuaEntryMode,
  type CuaEntryMode,
} from '@renderer/utils/cuaEntry';

export function MainLayout() {
  const navigate = useNavigate();
  const [entryMode, setEntryMode] = useState<CuaEntryMode>(getCuaEntryMode);
  const [hasModalOverlay, setHasModalOverlay] = useState(false);

  useEffect(() => {
    const handleModeChange = (event: Event) => {
      setEntryMode((event as CustomEvent<CuaEntryMode>).detail);
    };

    window.addEventListener(CUA_ENTRY_MODE_EVENT, handleModeChange);
    return () =>
      window.removeEventListener(CUA_ENTRY_MODE_EVENT, handleModeChange);
  }, []);

  useEffect(() => {
    const updateModalState = () => {
      setHasModalOverlay(
        Boolean(
          document.querySelector(
            '[data-slot="dialog-content"][data-state="open"], .medium-zoom-image--opened, .medium-zoom-overlay',
          ),
        ),
      );
    };

    updateModalState();

    const observer = new MutationObserver(updateModalState);
    observer.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ['class', 'data-state'],
    });

    return () => observer.disconnect();
  }, []);

  const shrinkToFeishuPanel = () => {
    setCuaEntryMode('panel');
    navigate('/');
  };

  return (
    <SidebarProvider
      style={{ '--sidebar-width-icon': '72px' }}
      className="flex h-screen w-full bg-white"
    >
      <AppSidebar />
      <SidebarInset className="flex-1">
        <Outlet />
      </SidebarInset>
      {entryMode === 'full' && !hasModalOverlay ? (
        <Button
          type="button"
          variant="secondary"
          size="icon"
          onClick={shrinkToFeishuPanel}
          onPointerDown={(event) => event.stopPropagation()}
          style={{ '-webkit-app-region': 'no-drag', pointerEvents: 'auto' }}
          className="fixed right-5 top-5 z-[9999] h-9 w-9 rounded-full shadow-lg"
          aria-label="缩小到飞书悬浮窗"
        >
          <Minimize2 className="h-4 w-4" />
        </Button>
      ) : null}
    </SidebarProvider>
  );
}
