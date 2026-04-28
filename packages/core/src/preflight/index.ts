export class PreflightError extends Error {
  kind: 'env' | 'permission' | 'lark_not_running' | 'ocr_bridge';

  constructor(kind: 'env' | 'permission' | 'lark_not_running' | 'ocr_bridge', message: string) {
    super(message);
    this.name = 'PreflightError';
    this.kind = kind;
  }
}

export async function runPreflight(): Promise<void> {
  checkRequiredEnv();
  await checkMacosPermissions();
  await checkLarkRunning();
  await checkOcrBridge();
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

interface OcrBridgeHealth {
  status: string;
}

export async function checkOcrBridge(): Promise<void> {
  const ocrPort = Number(process.env.CUA_OCR_PORT || 7010);
  const ocrHost = process.env.CUA_OCR_HOST || '127.0.0.1';
  
  try {
    const response = await fetch(`http://${ocrHost}:${ocrPort}/health`);
    const health = await response.json() as OcrBridgeHealth;
    if (health.status !== 'ok') {
      throw new PreflightError(
        'ocr_bridge',
        `OCR bridge service is not available. Status: ${health.status}. Please start the OCR bridge service by running: python packages/ocr-bridge/server.py`
      );
    }
  } catch {
    throw new PreflightError(
      'ocr_bridge',
      'OCR bridge service is not running. Please start the OCR bridge service by running: python packages/ocr-bridge/server.py'
    );
  }
}
