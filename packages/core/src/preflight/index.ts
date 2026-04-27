export class PreflightError extends Error {
  kind: 'env' | 'permission' | 'lark_not_running';

  constructor(kind: 'env' | 'permission' | 'lark_not_running', message: string) {
    super(message);
    this.name = 'PreflightError';
    this.kind = kind;
  }
}

export async function runPreflight(): Promise<void> {
  checkRequiredEnv();
  await checkMacosPermissions();
  await checkLarkRunning();
}

export function checkRequiredEnv(): void {
  const vlmBaseURL = process.env.CUA_VLM_BASE_URL;
  const vlmApiKey = process.env.CUA_VLM_API_KEY;
  const vlmModel = process.env.CUA_VLM_MODEL;

  if (!vlmBaseURL) {
    throw new PreflightError('env', 'Missing required environment variable: CUA_VLM_BASE_URL');
  }
  if (!vlmApiKey) {
    throw new PreflightError('env', 'Missing required environment variable: CUA_VLM_API_KEY');
  }
  if (!vlmModel) {
    throw new PreflightError('env', 'Missing required environment variable: CUA_VLM_MODEL');
  }
}

export async function checkMacosPermissions(): Promise<void> {
  if (process.platform !== 'darwin') {
    return;
  }
}

export async function checkLarkRunning(): Promise<void> {
  const larkProcessNames = [
    'Lark',
    'Feishu',
    '飞书',
  ];

  if (process.platform === 'win32') {
    const { execSync } = await import('child_process');
    try {
      const result = execSync('tasklist /FI "IMAGENAME eq Lark.exe" /NH', {
        encoding: 'utf-8',
        windowsHide: true,
      });
      if (result.toLowerCase().includes('lark')) {
        return;
      }
    } catch {
    }

    try {
      const result = execSync('tasklist /FI "IMAGENAME eq Feishu.exe" /NH', {
        encoding: 'utf-8',
        windowsHide: true,
      });
      if (result.toLowerCase().includes('feishu')) {
        return;
      }
    } catch {
    }

    throw new PreflightError('lark_not_running', 'Lark is not running. Please start Lark and try again.');
  }

  if (process.platform === 'darwin') {
    const { execSync } = await import('child_process');
    for (const name of larkProcessNames) {
      try {
        execSync(`pgrep -x "${name}"`, { encoding: 'utf-8' });
        return;
      } catch {
      }
    }
    throw new PreflightError('lark_not_running', 'Lark is not running. Please start Lark and try again.');
  }
}
