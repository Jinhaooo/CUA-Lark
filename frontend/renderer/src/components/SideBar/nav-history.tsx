/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState } from 'react';
import {
  MoreHorizontal,
  Trash2,
  History,
  ChevronRight,
} from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@renderer/components/ui/dropdown-menu';
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@renderer/components/ui/sidebar';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@renderer/components/ui/collapsible';
import { SessionItem } from '@renderer/db/session';
import { ShareOptions } from './share';

import { DeleteSessionDialog } from '@renderer/components/AlertDialog/delSessionDialog';

export function NavHistory({
  currentSessionId,
  history,
  onSessionClick,
  onSessionDelete,
}: {
  currentSessionId: string;
  history: SessionItem[];
  onSessionClick: (id: string) => void;
  onSessionDelete: (id: string) => void;
}) {
  const [isShareConfirmOpen, setIsShareConfirmOpen] = useState(false);
  const [id, setId] = useState('');
  const [isHistoryOpen, setIsHistoryOpen] = useState(true);
  const { setOpen, state } = useSidebar();

  const handleDelete = (id: string) => {
    setIsShareConfirmOpen(true);
    setId(id);
  };

  const handleHistory = () => {
    if (state === 'collapsed') {
      setOpen(true);
      setTimeout(() => {
        setIsHistoryOpen(true);
      }, 10);
    }
  };

  return (
    <>
      <SidebarGroup>
        <SidebarMenu className="items-center">
          <Collapsible
            key={'历史'}
            asChild
            open={isHistoryOpen}
            onOpenChange={setIsHistoryOpen}
            className="group/collapsible"
          >
            <SidebarMenuItem className="w-full flex flex-col items-center">
              <CollapsibleTrigger asChild>
                <SidebarMenuButton
                  className="!pr-2 font-medium"
                  onClick={handleHistory}
                >
                  <History strokeWidth={2} />
                  <span>历史</span>
                  <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                </SidebarMenuButton>
              </CollapsibleTrigger>
              <CollapsibleContent className="w-full">
                <SidebarMenuSub className="!mr-0 !pr-1">
                  {history.map((item) => (
                    <SidebarMenuSubItem key={item.id} className="group/item">
                      <SidebarMenuSubButton
                        className={`py-5 cursor-pointer hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${item.id === currentSessionId ? 'bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent' : 'text-muted-foreground'}`}
                        onClick={() => onSessionClick(item.id)}
                      >
                        <span className="max-w-38">{item.name}</span>
                      </SidebarMenuSubButton>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <SidebarMenuAction className="invisible group-hover/item:visible [&[data-state=open]]:visible mt-1">
                            <MoreHorizontal />
                            <span className="sr-only">更多</span>
                          </SidebarMenuAction>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          className="rounded-lg"
                          side={'right'}
                          align={'start'}
                        >
                          <ShareOptions sessionId={item.id} />
                          <DropdownMenuItem
                            className="text-red-400 focus:bg-red-50 focus:text-red-500"
                            onClick={() => handleDelete(item.id)}
                          >
                            <Trash2 className="text-red-400" />
                            <span>删除</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
        </SidebarMenu>
      </SidebarGroup>
      <DeleteSessionDialog
        open={isShareConfirmOpen}
        onOpenChange={setIsShareConfirmOpen}
        onConfirm={() => onSessionDelete(id)}
      />
    </>
  );
}
