/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Info } from 'lucide-react';

import { Card } from '@renderer/components/ui/card';
import { Button } from '@renderer/components/ui/button';
import {
  Tooltip as CNTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@renderer/components/ui/tooltip';

interface PresetBannerProps {
  url?: string;
  date?: number;
  handleUpdatePreset: (e: React.MouseEvent) => void;
  handleResetPreset: (e: React.MouseEvent) => void;
}

export function PresetBanner(props: PresetBannerProps) {
  return (
    <Card className="p-4 mb-4 bg-gray-50">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-700">
            远程预设管理
          </span>
          <TooltipProvider>
            <CNTooltip>
              <TooltipTrigger>
                <Info className="w-4 h-4 text-gray-400 hover:text-gray-500" />
              </TooltipTrigger>
              <TooltipContent>
                使用远程预设时，设置将变为只读
              </TooltipContent>
            </CNTooltip>
          </TooltipProvider>
        </div>

        <div>
          <p className="text-sm text-gray-600 line-clamp-2">{props.url}</p>
          {props.date && (
            <p className="text-xs text-gray-500 mt-1">
              {`上次更新时间：${new Date(props.date).toLocaleString()}`}
            </p>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="mb-0"
          onClick={props.handleUpdatePreset}
        >
          更新预设
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="text-red-400 border-red-400 hover:bg-red-50 hover:text-red-500 ml-4 mb-0"
          onClick={props.handleResetPreset}
        >
          切换为手动模式
        </Button>
      </div>
    </Card>
  );
}
