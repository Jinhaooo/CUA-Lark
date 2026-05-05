/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  SidebarMenu,
  SidebarMenuButton,
} from '@renderer/components/ui/sidebar';

import feishuLogo from '@resources/feishu-logo.png?url';

export function UITarsHeader() {
  return (
    <SidebarMenu className="items-center">
      <SidebarMenuButton
        // size="lg"
        className="mb-2 hover:bg-transparent data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0!"
      >
        <div className="flex aspect-square size-9 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-xs">
          <img
            src={feishuLogo}
            alt="飞书"
            className="h-full w-full object-cover"
          />
        </div>
        <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
          <span className="truncate font-semibold">Lark-CUA</span>
        </div>
      </SidebarMenuButton>
    </SidebarMenu>
  );
}
