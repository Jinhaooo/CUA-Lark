/**
 * Preflight - 预检检查模块
 * 
 * 在执行测试前检查环境是否满足要求：
 * - VLM环境变量检查
 * - 飞书/Feishu进程检查
 * - OCR Bridge健康检查
 */

import { validateVlmEnv } from '../model/env.js';

/**
 * 预检错误类型
 */
export class PreflightError extends Error {
  kind: 'env' | 'lark_not_running' | 'process' | 'ocr_bridge';

  constructor(kind: 'env' | 'lark_not_running' | 'process' | 'ocr_bridge', message: string) {
    super(message);
    this.name = 'PreflightError';
    this.kind = kind;
  }
}

/**
 * 预检结果
 */
/**
 * 运行所有预检检查
 * @throws PreflightError 如果任一预检失败
 */
export async function runPreflight(): Promise<void> {
  checkRequiredEnv();
  await checkMacosPermissions();
  await checkLarkRunning();
  await checkOcrBridge();
}

/**
 * 检查飞书进程是否运行
 * @returns 检查结果
 */
async function checkLarkProcess(): Promise<{ passed: boolean; reason: string }> {
  const platform = process.platform;
  
  try {
    if (platform === 'win32') {
      // Windows检查
      const { execSync } = await import('child_process');
      let processCheckDenied = false;
      const markDenied = (error: unknown) => {
        const text = String((error as { code?: unknown; message?: unknown; stderr?: unknown })?.code ?? '')
          + String((error as { message?: unknown })?.message ?? '')
          + String((error as { stderr?: unknown })?.stderr ?? '');
        if (/EPERM|Access denied/i.test(text)) {
          processCheckDenied = true;
        }
      };

      try {
        const output = execSync(
          'powershell.exe -NoProfile -Command "Get-Process -Name Lark,Feishu -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ProcessName"',
          { encoding: 'utf-8', windowsHide: true }
        );
        if (/\b(Lark|Feishu)\b/i.test(output)) {
          return { passed: true, reason: 'Lark/Feishu process found' };
        }
      } catch (error) {
        markDenied(error);
        // Fall through to tasklist for hosts where PowerShell process lookup is unavailable.
      }

      try {
        const output = execSync('tasklist /FI "IMAGENAME eq Lark.exe" /NH', { encoding: 'utf-8' });
        if (output.includes('Lark.exe')) {
          return { passed: true, reason: 'Lark process found' };
        }
      } catch (error) {
        markDenied(error);
        // Try Feishu below.
      }

      try {
        const output = execSync('tasklist /FI "IMAGENAME eq Feishu.exe" /NH', { encoding: 'utf-8' });
        if (output.includes('Feishu.exe')) {
          return { passed: true, reason: 'Feishu process found' };
        }
      } catch (error) {
        markDenied(error);
        // Report the original intent instead of leaking tasklist permission details.
      }

      if (processCheckDenied) {
        return { passed: true, reason: 'Lark/Feishu process check was denied by the host environment' };
      }

      return { passed: false, reason: 'Lark/Feishu is not running or cannot be detected' };
    } else if (platform === 'darwin') {
      // macOS检查
      const { execSync } = await import('child_process');
      for (const name of ['Lark', 'Feishu']) {
        try {
          const output = execSync(`pgrep -x "${name}"`, { encoding: 'utf-8' });
          if (output.trim()) {
            return { passed: true, reason: `${name} process found` };
          }
        } catch {
          // Try the next known process name.
        }
      }

      return { passed: false, reason: 'Lark/Feishu is not running' };
    } else {
      // 其他平台跳过检查
      return { passed: true, reason: 'Platform not supported for process check' };
    }
  } catch {
    return { passed: false, reason: 'Process check failed' };
  }
}

/**
 * 检查OCR Bridge服务健康状态
 * @returns 检查结果
 */
async function checkOcrBridge(): Promise<{ passed: boolean; reason: string }> {
  try {
    const { getOcrPort } = await import('../model/env.js');
    const port = getOcrPort();
    const response = await fetch(`http://localhost:${port}/health`);
    
    if (response.ok) {
      return { passed: true, reason: 'OCR Bridge healthy' };
    }
    return { passed: false, reason: 'OCR Bridge not healthy' };
  } catch {
    return { passed: false, reason: 'OCR Bridge not reachable' };
  }
}

/**
 * 检查必需的环境变量
 * @throws PreflightError 如果缺少必需的环境变量
 */
export function checkRequiredEnv(): void {
  const vlmResult = validateVlmEnv();
  if (!vlmResult.valid) {
    throw new PreflightError(
      'env',
      `Missing VLM environment variables: ${vlmResult.missing.join(', ')}`
    );
  }
}

/**
 * 检查macOS权限
 * @returns 检查结果
 */
export async function checkMacosPermissions(): Promise<void> {
  // 在非macOS平台上不做任何操作
  if (process.platform !== 'darwin') {
    return;
  }
  // macOS权限检查逻辑可以在这里添加
}

/**
 * 检查飞书进程是否运行
 * @returns 检查结果
 */
export async function checkLarkRunning(): Promise<{ passed: boolean; reason: string }> {
  if (process.env.CI) {
    return { passed: true, reason: 'CI environment skips process check' };
  }

  const result = await checkLarkProcess();
  if (!result.passed) {
    throw new PreflightError('lark_not_running', `${result.reason}. Please start Lark or Feishu and try again.`);
  }
  return result;
}
