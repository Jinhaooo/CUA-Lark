/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

// 导入IPC框架
import { initIpc } from '@ui-tars/electron-ipc/main';

// 导入类型定义
import { StatusEnum, Conversation, Message } from '@ui-tars/shared/types';

// 导入状态管理
import { store } from '@main/store/create';

// 导入核心服务
import { runAgent } from '@main/services/runAgent';
import { showWindow } from '@main/window/index';
import { closeScreenMarker } from '@main/window/ScreenMarker';

// 导入SDK类
import { GUIAgent } from '@ui-tars/sdk';
import { Operator } from '@ui-tars/sdk/core';

// 创建IPC路由器实例
const t = initIpc.create();

/**
 * GUIAgentManager - 代理管理器（单例模式）
 * 
 * 负责管理当前运行的GUIAgent实例，提供启动、暂停、恢复、停止等操作
 * 
 * 单例模式确保全局只有一个代理管理器实例，避免多个代理同时运行
 */
export class GUIAgentManager {
  private static instance: GUIAgentManager;  // 单例实例
  private currentAgent: GUIAgent<Operator> | null = null;  // 当前代理实例

  // 私有构造函数（防止外部实例化）
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}

  /**
   * 获取单例实例
   * @returns GUIAgentManager实例
   */
  public static getInstance(): GUIAgentManager {
    if (!GUIAgentManager.instance) {
      GUIAgentManager.instance = new GUIAgentManager();
    }
    return GUIAgentManager.instance;
  }

  /**
   * 设置当前代理实例
   * @param agent GUIAgent实例
   */
  public setAgent(agent: GUIAgent<Operator>) {
    this.currentAgent = agent;
  }

  /**
   * 获取当前代理实例
   * @returns 当前代理实例或null
   */
  public getAgent(): GUIAgent<Operator> | null {
    return this.currentAgent;
  }

  /**
   * 清除当前代理实例
   */
  public clearAgent() {
    this.currentAgent = null;
  }
}

/**
 * agentRoute - Agent相关的IPC路由定义
 * 
 * 提供渲染进程（UI）与主进程之间的通信接口：
 * - runAgent: 启动代理执行
 * - pauseRun: 暂停代理执行
 * - resumeRun: 恢复代理执行
 * - stopRun: 停止代理执行
 * - setInstructions: 设置指令
 * - setMessages: 设置消息
 * - setSessionHistoryMessages: 设置会话历史消息
 * - clearHistory: 清除历史记录
 */
export const agentRoute = t.router({
  /**
   * 启动代理执行
   * 
   * 检查当前是否正在执行，如果是则直接返回
   * 否则初始化中止控制器，设置状态为思考中，然后启动代理
   */
  runAgent: t.procedure
    .input<{ autoSkillSummaryEnabled?: boolean } | void>()
    .handle(async ({ input }) => {
      const { thinking } = store.getState();
      if (thinking) return;  // 防止重复启动

      // cua-lark 扩展：autoSkillSummaryEnabled 标志由前端传入；
      // 当前 stub 阶段仅 log，由后续 SelfHealingExecutor / FewShotMiner 集成消费
      if (input && typeof input === 'object' && 'autoSkillSummaryEnabled' in input) {
        // eslint-disable-next-line no-console
        console.log('[runAgent] autoSkillSummaryEnabled:', input.autoSkillSummaryEnabled);
      }

      // 初始化执行状态
      store.setState({
        abortController: new AbortController(),
        thinking: true,
        errorMsg: null,
      });

      // 执行代理
      await runAgent(store.setState, store.getState);

      // 执行完成，重置思考状态
      store.setState({ thinking: false });
    }),

  /**
   * 暂停代理执行
   * 
   * 获取当前代理实例并调用pause方法
   */
  pauseRun: t.procedure.input<void>().handle(async () => {
    const guiAgent = GUIAgentManager.getInstance().getAgent();
    if (guiAgent instanceof GUIAgent) {
      guiAgent.pause();
      store.setState({ thinking: false });
    }
  }),

  /**
   * 恢复代理执行
   * 
   * 获取当前代理实例并调用resume方法
   */
  resumeRun: t.procedure.input<void>().handle(async () => {
    const guiAgent = GUIAgentManager.getInstance().getAgent();
    if (guiAgent instanceof GUIAgent) {
      guiAgent.resume();
      store.setState({ thinking: false });
    }
  }),

  /**
   * 停止代理执行
   * 
   * 1. 设置状态为结束
   * 2. 显示主窗口
   * 3. 中止控制器
   * 4. 恢复并停止代理
   * 5. 关闭屏幕标记
   */
  stopRun: t.procedure.input<void>().handle(async () => {
    const { abortController } = store.getState();
    
    // 更新状态
    store.setState({ status: StatusEnum.END, thinking: false });
    showWindow();

    // 中止执行
    abortController?.abort();
    
    // 停止代理
    const guiAgent = GUIAgentManager.getInstance().getAgent();
    if (guiAgent instanceof GUIAgent) {
      guiAgent.resume();  // 先恢复（如果处于暂停状态）
      guiAgent.stop();    // 再停止
    }

    // 清理屏幕标记
    closeScreenMarker();
  }),

  /**
   * 设置用户指令
   * @param input.instructions 用户输入的自然语言指令
   */
  setInstructions: t.procedure
    .input<{ instructions: string }>()
    .handle(async ({ input }) => {
      store.setState({ instructions: input.instructions });
    }),

  /**
   * 设置消息列表
   * @param input.messages 对话消息列表
   */
  setMessages: t.procedure
    .input<{ messages: Conversation[] }>()
    .handle(async ({ input }) => {
      store.setState({ messages: input.messages });
    }),

  /**
   * 设置会话历史消息
   * @param input.messages 历史消息列表
   */
  setSessionHistoryMessages: t.procedure
    .input<{ messages: Message[] }>()
    .handle(async ({ input }) => {
      store.setState({ sessionHistoryMessages: input.messages });
    }),

  /**
   * 清除历史记录
   * 
   * 重置状态为初始状态：结束状态、空消息、无错误
   */
  clearHistory: t.procedure.input<void>().handle(async () => {
    store.setState({
      status: StatusEnum.END,
      messages: [],
      thinking: false,
      errorMsg: null,
      instructions: '',
    });
  }),
});
