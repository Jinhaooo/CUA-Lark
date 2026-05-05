/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Operator } from '@main/store/types';

export const COMPUTER_OPERATOR = '电脑操作员';
export const BROWSER_OPERATOR = '浏览器操作员';

export const OPERATOR_DISPLAY_NAME: Record<Operator, string> = {
  [Operator.RemoteComputer]: '远程电脑操作员',
  [Operator.RemoteBrowser]: '远程浏览器操作员',
  [Operator.LocalComputer]: '本地电脑操作员',
  [Operator.LocalBrowser]: '本地浏览器操作员',
};

export const getOperatorDisplayName = (operator?: Operator | string) =>
  OPERATOR_DISPLAY_NAME[operator as Operator] || String(operator || '');

export const OPERATOR_URL_MAP = {
  [Operator.RemoteComputer]: {
    text: '如需长期稳定使用，可登录火山引擎 FaaS 体验在线电脑操作员。',
    url: 'https://console.volcengine.com/vefaas/region:vefaas+cn-beijing/application/create?templateId=680b0a890e881f000862d9f0&channel=github&source=ui-tars',
  },
  [Operator.RemoteBrowser]: {
    text: '如需长期稳定使用，可登录火山引擎 FaaS 体验在线浏览器操作员。',
    url: 'https://console.volcengine.com/vefaas/region:vefaas+cn-beijing/application/create?templateId=67f7b4678af5a6000850556c&channel=github&source=ui-tars',
  },
};
