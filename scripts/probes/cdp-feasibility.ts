import * as child_process from 'child_process';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

const CDP_PORT = 9222;
const FEISHU_PATHS = [
  process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Feishu', '7.67.9', 'Feishu.exe') : '',
  process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Feishu', 'app', 'Feishu.exe') : '',
  process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Feishu', 'Feishu.exe') : '',
  process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Feishu', 'app-*', 'Feishu.exe') : '',
  '/Applications/Lark.app/Contents/MacOS/Lark',
  '/Applications/Feishu.app/Contents/MacOS/Feishu',
];

interface L1Result {
  success: boolean;
  status: 'pass' | 'warning' | 'fail';
  feishuPath: string;
  portResponse: string | null;
  error?: string;
}

interface L2Result {
  success: boolean;
  status: 'pass' | 'warning' | 'fail';
  domDepth: number;
  uniqueTextCount: number;
  buttonCount: number;
  error?: string;
}

interface L3Target {
  name: string;
  selector: string;
  firstHit: boolean;
  firstCoords: { x: number; y: number } | null;
  switchHit: boolean;
  switchCoords: { x: number; y: number } | null;
  restartHit: boolean;
  restartCoords: { x: number; y: number } | null;
}

interface L3Result {
  success: boolean;
  status: 'pass' | 'warning' | 'fail';
  targets: L3Target[];
  hitRate: number;
}

interface ReportData {
  date: string;
  feishuVersion: string;
  os: string;
  l1: L1Result;
  l2?: L2Result;
  l3?: L3Result;
  overallConclusion: 'pass' | 'partial' | 'fail';
  engineeringNotes: string[];
  m3bSuggestions: string[];
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkPort(port: number): Promise<string | null> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/json/version`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => { resolve(data); });
    });
    req.on('error', () => { resolve(null); });
    req.setTimeout(3000, () => { req.destroy(); resolve(null); });
  });
}

function findFeishuExecutable(): string {
  for (const candidate of FEISHU_PATHS) {
    if (!candidate) continue;
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    if (candidate.includes('app-*')) {
      const dir = path.dirname(candidate);
      try {
        const entries = fs.readdirSync(dir);
        const appDir = entries.find(e => e.startsWith('app-'));
        if (appDir) {
          const fullPath = path.join(dir, appDir, 'Feishu.exe');
          if (fs.existsSync(fullPath)) {
            return fullPath;
          }
        }
      } catch {
        continue;
      }
    }
  }
  return '';
}

async function killFeishu(): Promise<void> {
  const platform = process.platform;
  return new Promise((resolve) => {
    let cmd: string;
    let args: string[];
    if (platform === 'win32') {
      cmd = 'taskkill';
      args = ['/F', '/IM', 'Feishu.exe'];
    } else {
      cmd = 'pkill';
      args = ['-f', 'Feishu|Lark'];
    }
    child_process.spawn(cmd, args).on('exit', () => resolve());
  });
}

async function checkFeishuRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      const proc = child_process.spawn('tasklist', ['/FI', 'IMAGENAME eq Feishu.exe']);
      let output = '';
      proc.stdout.on('data', (data) => { output += data; });
      proc.on('exit', () => {
        resolve(output.includes('Feishu.exe'));
      });
    } else {
      const proc = child_process.spawn('pgrep', ['-f', 'Feishu|Lark']);
      proc.on('exit', (code) => {
        resolve(code === 0);
      });
    }
  });
}

async function probeL1(): Promise<L1Result> {
  console.log('\n=== L1: 启动验证 ===');
  
  const feishuPath = findFeishuExecutable();
  if (!feishuPath) {
    console.log('❌ 未找到飞书可执行文件');
    return {
      success: false,
      status: 'fail',
      feishuPath: '',
      portResponse: null,
      error: '未找到飞书可执行文件'
    };
  }
  console.log(`找到飞书路径: ${feishuPath}`);
  
  await killFeishu();
  await delay(2000);
  
  console.log('启动飞书...');
  
  const env = { ...process.env };
  env.ELECTRON_ENABLE_LOGGING = 'true';
  env.ELECTRON_DEBUG = 'true';
  env.NODE_ENV = 'development';
  
  const proc = child_process.spawn(feishuPath, [
    '--remote-debugging-port=9222',
    '--remote-allow-origins=*',
    '--remote-debugging-address=127.0.0.1',
    '--enable-logging',
    '--v=1'
  ], { env });
  
  proc.on('error', (err) => {
    console.log(`启动错误: ${err.message}`);
  });
  
  proc.stdout.on('data', (data) => console.log(`stdout: ${data.toString()}`));
  proc.stderr.on('data', (data) => console.log(`stderr: ${data.toString()}`));
  
  proc.on('exit', (code, signal) => {
    console.log(`飞书进程退出，代码: ${code}, 信号: ${signal}`);
  });
  
  await delay(5000);
  
  const isRunning = await checkFeishuRunning();
  console.log(`飞书进程运行状态: ${isRunning ? '运行中' : '已退出'}`);
  
  console.log('检查端口 9222...');
  const response9222 = await checkPort(9222);
  
  if (response9222) {
    console.log('端口 9222 有响应');
  } else {
    console.log('端口 9222 无响应，尝试其他常见调试端口...');
    const ports = [9223, 9224, 9229, 8080, 8888];
    for (const port of ports) {
      const resp = await checkPort(port);
      if (resp) {
        console.log(`端口 ${port} 有响应!`);
        break;
      }
    }
  }
  
  const response = response9222;
  
  if (response) {
    try {
      const json = JSON.parse(response);
      if (json.webSocketDebuggerUrl) {
        console.log('✅ 端口正常响应，包含 webSocketDebuggerUrl');
        return {
          success: true,
          status: 'pass',
          feishuPath,
          portResponse: response.substring(0, 200) + '...'
        };
      }
    } catch {
      console.log('⚠️ 端口响应但不是有效JSON');
      return {
        success: false,
        status: 'warning',
        feishuPath,
        portResponse: response.substring(0, 200) + '...',
        error: '端口响应但不是有效JSON'
      };
    }
  }
  
  console.log('⚠️ 飞书启动但端口未响应');
  return {
    success: false,
    status: 'warning',
    feishuPath,
    portResponse: null,
    error: '飞书启动但端口未响应'
  };
}

async function probeL2(): Promise<L2Result> {
  console.log('\n=== L2: DOM 可达性 ===');
  
  const CDP = await import('chrome-remote-interface');
  
  try {
    const targets = await CDP.List({ port: CDP_PORT });
    console.log(`找到 ${targets.length} 个 targets`);
    
    const pageTarget = targets.find(t => t.type === 'page');
    if (!pageTarget) {
      return {
        success: false,
        status: 'fail',
        domDepth: 0,
        uniqueTextCount: 0,
        buttonCount: 0,
        error: '未找到 page target'
      };
    }
    
    const client = await CDP({ target: pageTarget });
    const { DOM, Runtime } = client;
    
    await DOM.enable();
    const { root } = await DOM.getDocument({ depth: -1 });
    
    const textNodes = new Set<string>();
    let maxDepth = 0;
    
    function traverse(node: any, depth: number) {
      maxDepth = Math.max(maxDepth, depth);
      if (node.nodeName === '#text' && node.nodeValue?.trim()) {
        textNodes.add(node.nodeValue.trim());
      }
      if (node.children) {
        node.children.forEach((child: any) => traverse(child, depth + 1));
      }
    }
    
    traverse(root, 0);
    
    const buttons = await Runtime.evaluate({
      expression: 'document.querySelectorAll(\'[role="button"]\').length'
    });
    
    await client.close();
    
    const domDepth = maxDepth;
    const uniqueTextCount = textNodes.size;
    const buttonCount = buttons.result.value as number;
    
    console.log(`DOM 树深度: ${domDepth}`);
    console.log(`unique 文本节点数: ${uniqueTextCount}`);
    console.log(`[role="button"] 命中数: ${buttonCount}`);
    
    const pass = domDepth >= 5 && uniqueTextCount >= 20 && buttonCount >= 5;
    
    if (pass) {
      console.log('✅ L2 通过');
      return { success: true, status: 'pass', domDepth, uniqueTextCount, buttonCount };
    } else {
      console.log('⚠️ DOM 内容空洞');
      return { success: false, status: 'warning', domDepth, uniqueTextCount, buttonCount };
    }
    
  } catch (error) {
    console.log(`❌ L2 失败: ${(error as Error).message}`);
    return {
      success: false,
      status: 'fail',
      domDepth: 0,
      uniqueTextCount: 0,
      buttonCount: 0,
      error: (error as Error).message
    };
  }
}

async function probeL3(): Promise<L3Result> {
  console.log('\n=== L3: ARIA 定位稳定性 ===');
  
  const CDP = await import('chrome-remote-interface');
  
  const targetsToTest: L3Target[] = [
    { name: '搜索按钮', selector: '[aria-label="搜索"]', firstHit: false, firstCoords: null, switchHit: false, switchCoords: null, restartHit: false, restartCoords: null },
    { name: '消息输入框', selector: '[role="textbox"]', firstHit: false, firstCoords: null, switchHit: false, switchCoords: null, restartHit: false, restartCoords: null },
    { name: '发送按钮', selector: '[aria-label="发送"]', firstHit: false, firstCoords: null, switchHit: false, switchCoords: null, restartHit: false, restartCoords: null },
    { name: '消息Tab', selector: '[aria-label="消息"]', firstHit: false, firstCoords: null, switchHit: false, switchCoords: null, restartHit: false, restartCoords: null },
    { name: '日历Tab', selector: '[aria-label="日历"]', firstHit: false, firstCoords: null, switchHit: false, switchCoords: null, restartHit: false, restartCoords: null },
  ];
  
  async function runSingleProbe(target: L3Target): Promise<{ hit: boolean; coords: { x: number; y: number } | null }> {
    try {
      const targets = await CDP.List({ port: CDP_PORT });
      const pageTarget = targets.find(t => t.type === 'page');
      if (!pageTarget) return { hit: false, coords: null };
      
      const client = await CDP({ target: pageTarget });
      const { Runtime, DOM } = client;
      
      await DOM.enable();
      
      const result = await Runtime.evaluate({
        expression: `document.querySelector('${target.selector}')`
      });
      
      if (!result.result.objectId) {
        await client.close();
        return { hit: false, coords: null };
      }
      
      const boxResult = await DOM.getBoxModel({ objectId: result.result.objectId });
      await client.close();
      
      if (boxResult.model?.content) {
        const content = boxResult.model.content;
        const x = (content[0] + content[2]) / 2;
        const y = (content[1] + content[3]) / 2;
        return { hit: true, coords: { x, y } };
      }
      
      return { hit: false, coords: null };
    } catch {
      return { hit: false, coords: null };
    }
  }
  
  console.log('第一次探测...');
  for (const target of targetsToTest) {
    const { hit, coords } = await runSingleProbe(target);
    target.firstHit = hit;
    target.firstCoords = coords;
    console.log(`  ${target.name}: ${hit ? '✅' : '❌'} ${coords ? `(${coords.x.toFixed(0)}, ${coords.y.toFixed(0)})` : ''}`);
  }
  
  console.log('\n请手动切换到不同会话后按回车继续...');
  await new Promise(resolve => process.stdin.once('data', resolve));
  
  console.log('第二次探测（切换会话后）...');
  for (const target of targetsToTest) {
    const { hit, coords } = await runSingleProbe(target);
    target.switchHit = hit;
    target.switchCoords = coords;
    console.log(`  ${target.name}: ${hit ? '✅' : '❌'} ${coords ? `(${coords.x.toFixed(0)}, ${coords.y.toFixed(0)})` : ''}`);
  }
  
  console.log('\n请手动重启飞书后按回车继续...');
  await new Promise(resolve => process.stdin.once('data', resolve));
  
  console.log('第三次探测（重启后）...');
  for (const target of targetsToTest) {
    const { hit, coords } = await runSingleProbe(target);
    target.restartHit = hit;
    target.restartCoords = coords;
    console.log(`  ${target.name}: ${hit ? '✅' : '❌'} ${coords ? `(${coords.x.toFixed(0)}, ${coords.y.toFixed(0)})` : ''}`);
  }
  
  const totalAttempts = targetsToTest.length * 3;
  const successfulHits = targetsToTest.reduce((sum, t) => 
    sum + (t.firstHit ? 1 : 0) + (t.switchHit ? 1 : 0) + (t.restartHit ? 1 : 0), 0);
  const hitRate = (successfulHits / totalAttempts) * 100;
  
  console.log(`\n命中率: ${successfulHits}/${totalAttempts} = ${hitRate.toFixed(1)}%`);
  
  const stableTargets = targetsToTest.filter(t => t.firstHit && t.switchHit && t.restartHit).length;
  const success = stableTargets >= 4;
  
  return {
    success,
    status: success ? 'pass' : stableTargets >= 2 ? 'warning' : 'fail',
    targets: targetsToTest,
    hitRate
  };
}

function getFeishuVersion(): string {
  try {
    const feishuPath = findFeishuExecutable();
    if (feishuPath && process.platform === 'win32') {
      const result = child_process.execSync(`powershell "(Get-Item '${feishuPath}').VersionInfo.ProductVersion"`).toString().trim();
      return result || '未知';
    }
  } catch {
    // ignore
  }
  return '未知';
}

function getOS(): string {
  if (process.platform === 'win32') {
    return `Windows ${process.arch}`;
  } else if (process.platform === 'darwin') {
    return `macOS ${require('os').release()}`;
  }
  return process.platform;
}

function generateReport(data: ReportData): string {
  const conclusionText = {
    pass: '✅ CDP 路径可行，建议 M3b 采纳',
    partial: '⚠️ CDP 路径部分可行，建议在 …… 场景使用，其余场景仍走 OCR/VLM',
    fail: '❌ CDP 路径不可行，建议 M3b 走纯 OCR + 视觉鲁棒性方向'
  };
  
  let report = `# CDP 可行性验证报告

- 验证日期：${data.date}
- 飞书版本：${data.feishuVersion}
- 操作系统：${data.os}
- 探针脚本：scripts/probes/cdp-feasibility.ts

## 总体结论

${conclusionText[data.overallConclusion]}

## L1 启动验证
- 飞书可执行文件路径：${data.l1.feishuPath || '未找到'}
- 启动命令：${data.l1.feishuPath || ''} --remote-debugging-port=9222 --remote-allow-origins=*
- 端口响应：${data.l1.status === 'pass' ? '✅' : data.l1.status === 'warning' ? '⚠️' : '❌'}
- 关键发现：${data.l1.error || '无'}

`;

  if (data.l2) {
    report += `## L2 DOM 可达性
- DOM 树深度：${data.l2.domDepth}
- unique 文本节点数：${data.l2.uniqueTextCount}
- \`[role="button"]\` 命中数：${data.l2.buttonCount}
- 关键发现：${data.l2.error || '无'}

`;
  }

  if (data.l3) {
    report += `## L3 ARIA 定位稳定性

| 目标元素 | selector | 首次命中 | 切会话后命中 | 重启后命中 |
|---|---|---|---|---|
`;
    
    for (const target of data.l3.targets) {
      const firstStatus = target.firstHit ? `✅ (${target.firstCoords?.x.toFixed(0)}, ${target.firstCoords?.y.toFixed(0)})` : '❌';
      const switchStatus = target.switchHit ? `✅ (${target.switchCoords?.x.toFixed(0)}, ${target.switchCoords?.y.toFixed(0)})` : '❌';
      const restartStatus = target.restartHit ? `✅ (${target.restartCoords?.x.toFixed(0)}, ${target.restartCoords?.y.toFixed(0)})` : '❌';
      
      report += `| ${target.name} | \`${target.selector}\` | ${firstStatus} | ${switchStatus} | ${restartStatus} |\n`;
    }
    
    report += `
命中率：${Math.round(data.l3.hitRate)}%

`;
  }

  report += `## 工程注意事项
`;
  for (const note of data.engineeringNotes) {
    report += `- ${note}\n`;
  }

  report += `

## 对 M3b 的建议
`;
  for (const suggestion of data.m3bSuggestions) {
    report += `- ${suggestion}\n`;
  }

  return report;
}

async function main() {
  console.log('=== CDP 可行性验证探针 ===');
  console.log(`日期：${new Date().toISOString()}`);
  console.log(`操作系统：${getOS()}`);
  console.log(`飞书版本：${getFeishuVersion()}`);
  
  const reportData: ReportData = {
    date: new Date().toISOString().split('T')[0],
    feishuVersion: getFeishuVersion(),
    os: getOS(),
    l1: await probeL1(),
    overallConclusion: 'fail',
    engineeringNotes: [],
    m3bSuggestions: []
  };
  
  if (reportData.l1.status !== 'pass') {
    reportData.overallConclusion = 'fail';
    reportData.engineeringNotes.push('飞书启动参数被拦截或端口未开放');
    reportData.engineeringNotes.push('建议检查飞书是否有启动器拦截参数');
    reportData.m3bSuggestions.push('CDP 路径不可行，建议 M3b 走纯 OCR + 视觉鲁棒性方向');
    
    const report = generateReport(reportData);
    fs.writeFileSync('docs/cdp-feasibility-report.md', report);
    console.log('\n=== 报告已生成：docs/cdp-feasibility-report.md ===');
    console.log('L1 未通过，终止验证');
    return;
  }
  
  reportData.l2 = await probeL2();
  
  if (reportData.l2.status !== 'pass') {
    reportData.overallConclusion = 'fail';
    reportData.engineeringNotes.push('DOM 内容空洞或无法获取');
    reportData.engineeringNotes.push('飞书可能使用 Canvas 渲染核心区域');
    reportData.m3bSuggestions.push('CDP 路径不可行，建议 M3b 走纯 OCR + 视觉鲁棒性方向');
    
    const report = generateReport(reportData);
    fs.writeFileSync('docs/cdp-feasibility-report.md', report);
    console.log('\n=== 报告已生成：docs/cdp-feasibility-report.md ===');
    console.log('L2 未通过，终止验证');
    return;
  }
  
  reportData.l3 = await probeL3();
  
  if (reportData.l3.status === 'pass') {
    reportData.overallConclusion = 'pass';
    reportData.engineeringNotes.push('飞书启动器未拦截参数');
    reportData.engineeringNotes.push('IM 主框架 DOM 可达，ARIA 属性完整');
    reportData.m3bSuggestions.push('建议 M3b 采纳 CDP 路径');
    reportData.m3bSuggestions.push('主要 IM/Cal/Docs 框架元素 CDP 可达');
  } else if (reportData.l3.status === 'warning') {
    reportData.overallConclusion = 'partial';
    reportData.engineeringNotes.push('部分元素定位不稳定');
    reportData.engineeringNotes.push('建议验证中英文 ARIA name 差异');
    reportData.m3bSuggestions.push('CDP 路径部分可行，建议在稳定场景使用');
    reportData.m3bSuggestions.push('建议三段降级顺序：CDP → OCR → VLM');
  } else {
    reportData.overallConclusion = 'fail';
    reportData.engineeringNotes.push('ARIA 定位能力不足');
    reportData.m3bSuggestions.push('CDP 路径不可行，建议 M3b 走纯 OCR + 视觉鲁棒性方向');
  }
  
  const report = generateReport(reportData);
  fs.writeFileSync('docs/cdp-feasibility-report.md', report);
  console.log('\n=== 报告已生成：docs/cdp-feasibility-report.md ===');
}

main().catch(console.error);