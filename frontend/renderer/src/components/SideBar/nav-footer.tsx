/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Library, Settings } from 'lucide-react';

import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
} from '@renderer/components/ui/sidebar';

interface NavSettingsProps {
  onClick: () => void;
  onSkillClick: () => void;
}

export function NavSettings({ onClick, onSkillClick }: NavSettingsProps) {
  return (
    <SidebarGroup>
      <SidebarMenu className="items-center">
        <SidebarMenuButton className="font-medium" onClick={onSkillClick}>
          <Library />
          <span>技能库</span>
        </SidebarMenuButton>
        <SidebarMenuButton className="font-medium" onClick={onClick}>
          <Settings />
          <span>设置</span>
        </SidebarMenuButton>
      </SidebarMenu>
    </SidebarGroup>
  );
}
