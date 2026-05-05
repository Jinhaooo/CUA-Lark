/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

// 导入nut-js库（用于键盘和鼠标操作）
import { Key, keyboard } from '@computer-use/nut-js';

// 导入SDK类型定义
import {
  type ScreenshotOutput,  // 截图输出类型
  type ExecuteParams,     // 执行参数类型
  type ExecuteOutput,     // 执行输出类型
} from '@ui-tars/sdk/core';

// 导入基础操作器
import { NutJSOperator } from '@ui-tars/operator-nut-js';

// 导入Electron API
import { clipboard, desktopCapturer } from 'electron';

// 导入内部模块
import * as env from '@main/env';           // 环境变量
import { logger } from '@main/logger';     // 日志记录器
import { sleep } from '@ui-tars/shared/utils';  // 工具函数
import { getScreenSize } from '@main/utils/screen';  // 屏幕尺寸工具

/**
 * NutJSElectronOperator - Electron环境下的本地电脑操作器
 * 
 * 继承自NutJSOperator，扩展了以下功能：
 * 1. 使用Electron的desktopCapturer进行截图（支持多显示器）
 * 2. Windows系统下的剪贴板优化输入方式
 * 
 * 支持的动作空间：
 * - click: 单击
 * - left_double: 双击
 * - right_single: 右键单击
 * - drag: 拖拽
 * - hotkey: 快捷键
 * - type: 输入文本
 * - scroll: 滚动
 * - wait: 等待
 * - finished: 完成任务
 * - call_user: 调用用户
 */
export class NutJSElectronOperator extends NutJSOperator {
  /** 动作空间定义 - 告诉模型可以执行哪些操作 */
  static MANUAL = {
    ACTION_SPACES: [
      `click(start_box='[x1, y1, x2, y2]')`,           // 单击指定区域
      `left_double(start_box='[x1, y1, x2, y2]')`,      // 双击指定区域
      `right_single(start_box='[x1, y1, x2, y2]')`,     // 右键单击指定区域
      `drag(start_box='[x1, y1, x2, y2]', end_box='[x3, y3, x4, y4]')`,  // 拖拽
      `hotkey(key='')`,                                // 快捷键
      `type(content='') #提交输入请在末尾加"\\n"`,       // 输入文本
      `scroll(start_box='[x1, y1, x2, y2]', direction='down or up or right or left')`,  // 滚动
      `wait() #等待5秒并截图检查变化`,                  // 等待
      `finished()`,                                    // 完成任务
      `call_user() #任务无法完成时调用用户`,             // 调用用户
    ],
  };

  /**
   * 截图方法 - 使用Electron的desktopCapturer获取屏幕截图
   * 
   * 特点：
   * 1. 支持多显示器，自动选择主显示器
   * 2. 处理高DPI屏幕（Retina/Mac）的缩放问题
   * 3. 返回物理像素尺寸的截图
   * 
   * @returns 截图输出（base64编码和缩放因子）
   */
  public async screenshot(): Promise<ScreenshotOutput> {
    // 获取屏幕尺寸信息
    const {
      physicalSize,      // 物理像素尺寸
      logicalSize,       // 逻辑像素尺寸
      scaleFactor,       // 缩放因子（物理/逻辑）
      id: primaryDisplayId,  // 主显示器ID
    } = getScreenSize();

    logger.info('[screenshot] [primaryDisplay]', 'logicalSize:', logicalSize, 'scaleFactor:', scaleFactor);

    // 使用Electron的desktopCapturer获取屏幕源
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.round(logicalSize.width),
        height: Math.round(logicalSize.height),
      },
    });

    // 找到主显示器的截图源
    const primarySource =
      sources.find((source) => source.display_id === primaryDisplayId.toString()) || sources[0];

    // 如果找不到主显示器，回退到父类的截图方法
    if (!primarySource) {
      logger.error('[screenshot] Primary display source not found', {
        primaryDisplayId,
        availableSources: sources.map((s) => s.display_id),
      });
      return await super.screenshot();
    }

    // 获取缩略图并调整到物理像素尺寸
    const screenshot = primarySource.thumbnail;
    const resized = screenshot.resize({
      width: physicalSize.width,
      height: physicalSize.height,
    });

    // 返回base64编码的JPEG图片和缩放因子
    return {
      base64: resized.toJPEG(75).toString('base64'),
      scaleFactor,
    };
  }

  /**
   * 执行动作方法
   * 
   * 重写父类方法，添加Windows系统下的剪贴板输入优化
   * 当执行type动作且在Windows系统上时，使用Ctrl+V粘贴方式输入文本
   * 这样可以避免输入法问题和特殊字符处理问题
   * 
   * @param params 执行参数（动作类型、输入参数等）
   * @returns 执行输出
   */
  async execute(params: ExecuteParams): Promise<ExecuteOutput> {
    const { action_type, action_inputs } = params.parsedPrediction;

    // Windows系统下的type动作优化
    if (action_type === 'type' && env.isWindows && action_inputs?.content) {
      const content = action_inputs.content?.trim();
      logger.info('[device] type', content);

      // 移除末尾的换行符（如果有）
      const stripContent = content.replace(/\\n$/, '').replace(/\n$/, '');
      
      // 保存原始剪贴板内容
      const originalClipboard = clipboard.readText();
      
      // 使用剪贴板粘贴方式输入
      clipboard.writeText(stripContent);
      await keyboard.pressKey(Key.LeftControl, Key.V);
      await sleep(50);
      await keyboard.releaseKey(Key.LeftControl, Key.V);
      await sleep(50);
      
      // 恢复原始剪贴板内容
      clipboard.writeText(originalClipboard);
    } else {
      // 其他情况调用父类方法
      return await super.execute(params);
    }
  }
}
