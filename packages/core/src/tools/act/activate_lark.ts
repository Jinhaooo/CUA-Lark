import { z } from 'zod';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Tool } from '../types.js';

const execFileAsync = promisify(execFile);

/**
 * activate_lark: bring the Lark/Feishu desktop window to the foreground.
 * Required as the first action in every task before any click/type/hotkey,
 * otherwise the agent perceives whatever the user happens to have focused
 * (chat window / desktop) and operations land on the wrong surface.
 *
 * Idempotent: if Lark/Feishu is already focused, returns success quickly.
 * Safe to call mid-task if focus seems lost.
 */
export const activateLarkTool: Tool<{ app?: string }> = {
  name: 'activate_lark',
  description:
    'Bring the Lark/Feishu desktop window to the foreground. MUST be the first tool you call in every task. Args are optional — call with `{}` to auto-detect whichever client is running. Also call again mid-task if you suspect focus has shifted away.',
  // Schema is permissive on purpose: VLMs reliably get casing wrong (passing
  // "Lark" / "LARK" / "Feishu"). We normalize inside `execute` and silently
  // accept anything that maps to lark/feishu/auto.
  argsSchema: z.object({
    app: z.string().optional(),
  }),
  async execute(_ctx, args) {
    if (process.platform !== 'win32') {
      return {
        success: true,
        observation: `activate_lark skipped: unsupported platform ${process.platform}`,
      };
    }

    const raw = (args.app ?? 'auto').toString().toLowerCase().trim();
    const target: 'auto' | 'lark' | 'feishu' =
      raw === 'feishu' || raw === 'lark' ? raw : 'auto';

    // Lark and Feishu are the same product in different regions; only one is
    // typically installed. Always search both with a preferred order so the
    // agent can't lock itself out by picking the wrong region in `app`.
    const names: string[] =
      target === 'feishu' ? ['Feishu', 'Lark'] : ['Lark', 'Feishu'];

    // Avoid ':' inside double-quoted PS strings — PowerShell treats `$var:` as
    // a PSDrive scope qualifier and ParserError-fails. Use '|' as separator.
    const namesPs = names.map((n) => `'${n.replace(/'/g, "''")}'`).join(',');

    // Why this is not just AppActivate:
    // Microsoft.VisualBasic.Interaction.AppActivate calls SetForegroundWindow
    // under the hood, which Windows blocks for processes that don't already
    // own the foreground (anti-focus-stealing, since Vista). PowerShell here
    // is spawned by Node — never the foreground process — so AppActivate
    // returns success-shaped data but the focus never moves. Real fix: use
    // AttachThreadInput to inherit the current foreground process's input
    // queue, then SetForegroundWindow. Restore via SW_RESTORE if minimized.
    const script = `
$ErrorActionPreference = 'SilentlyContinue'
if (-not ('CuaActivate' -as [Type])) {
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class CuaActivate {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
}
"@
}
$activated = $false
foreach ($name in @(${namesPs})) {
  $proc = Get-Process -Name $name -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if ($proc) {
    $hwnd = $proc.MainWindowHandle
    if ([CuaActivate]::IsIconic($hwnd)) { [void][CuaActivate]::ShowWindow($hwnd, 9) }  # SW_RESTORE
    $fg = [CuaActivate]::GetForegroundWindow()
    $fgPid = 0
    $fgThread = [CuaActivate]::GetWindowThreadProcessId($fg, [ref]$fgPid)
    $myThread = [CuaActivate]::GetCurrentThreadId()
    [void][CuaActivate]::AttachThreadInput($myThread, $fgThread, $true)
    [void][CuaActivate]::BringWindowToTop($hwnd)
    [void][CuaActivate]::SetForegroundWindow($hwnd)
    [void][CuaActivate]::AttachThreadInput($myThread, $fgThread, $false)
    Start-Sleep -Milliseconds 80
    $now = [CuaActivate]::GetForegroundWindow()
    $verified = if ($now -eq $hwnd) { 'verified' } else { 'unverified' }
    $activated = $true
    Write-Output ('ok|' + $name + '|' + $proc.Id + '|' + $verified)
    break
  }
}
if (-not $activated) { Write-Output 'miss' }
`.trim();

    try {
      const { stdout } = await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
        { windowsHide: true, timeout: 5000 },
      );
      const out = stdout.trim();
      if (out.startsWith('ok|')) {
        const [, app, pid, verified] = out.split('|');
        // Brief repaint window so subsequent screenshot reflects the activation.
        await new Promise((r) => setTimeout(r, 350));
        if (verified !== 'verified') {
          // Foreground hwnd post-call didn't match target — typically another
          // process (e.g. an installer / system dialog) re-stole focus, or the
          // user is interacting with another window. Surface so the agent
          // doesn't proceed to click into the wrong surface.
          return {
            success: false,
            observation: `activate_lark called for ${app} (PID ${pid}) but foreground verification failed — focus did not land on the Lark/Feishu window. Likely cause: another window (installer / dialog / your IDE) re-stole focus. Take a screenshot to inspect, then try again or ask the user to switch windows manually.`,
            error: { kind: 'unknown', message: 'foreground_verify_failed' },
          };
        }
        return {
          success: true,
          observation: `Activated ${app} (PID ${pid}). The Lark/Feishu window is now verified in the foreground.`,
        };
      }
      return {
        success: false,
        observation: `activate_lark failed: no Lark/Feishu MainWindow found among [${names.join(', ')}]. Make sure the Lark or Feishu desktop client is running and not minimized to tray.`,
        error: { kind: 'unknown', message: 'no Lark/Feishu MainWindow' },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        observation: `activate_lark threw: ${message}`,
        error: { kind: 'unknown', message },
      };
    }
  },
  category: 'act',
  costHint: 'cheap',
};
