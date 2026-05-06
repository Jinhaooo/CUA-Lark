import { performance, PerformanceObserver } from 'perf_hooks';
import * as os from 'os';

interface CpuSample {
  timestamp: number;
  idle: number;
  total: number;
}

interface FpsSample {
  timestamp: number;
  fps: number;
}

interface OverlayPerfResult {
  avgCpuUsage: number;
  maxCpuUsage: number;
  avgFps: number;
  minFps: number;
  fpsBelow60Count: number;
  cpuSamples: CpuSample[];
  fpsSamples: FpsSample[];
}

function getCpuUsage(): CpuSample {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;

  cpus.forEach((cpu) => {
    for (const type in cpu.times) {
      totalTick += cpu.times[type as keyof typeof cpu.times];
    }
    totalIdle += cpu.times.idle;
  });

  return {
    timestamp: performance.now(),
    idle: totalIdle / cpus.length,
    total: totalTick / cpus.length,
  };
}

async function runOverlayPerfTest(durationMs: number = 30000): Promise<OverlayPerfResult> {
  console.log(`🚀 Starting overlay performance test (${durationMs}ms)...`);

  const cpuSamples: CpuSample[] = [];
  const fpsSamples: FpsSample[] = [];
  
  const startSample = getCpuUsage();
  cpuSamples.push(startSample);

  const interval = setInterval(() => {
    cpuSamples.push(getCpuUsage());
  }, 100);

  const startTime = performance.now();
  let frameCount = 0;
  let lastFpsTime = startTime;

  const animate = () => {
    frameCount++;
    const now = performance.now();
    
    if (now - lastFpsTime >= 1000) {
      fpsSamples.push({
        timestamp: now,
        fps: frameCount,
      });
      frameCount = 0;
      lastFpsTime = now;
    }

    if (now - startTime < durationMs) {
      requestAnimationFrame(animate);
    }
  };

  await new Promise<void>((resolve) => {
    requestAnimationFrame(animate);
    setTimeout(resolve, durationMs);
  });

  clearInterval(interval);

  const cpuUsages = cpuSamples.slice(1).map((sample, index) => {
    const prev = cpuSamples[index];
    const idleDiff = sample.idle - prev.idle;
    const totalDiff = sample.total - prev.total;
    return ((totalDiff - idleDiff) / totalDiff) * 100;
  });

  const fpsValues = fpsSamples.map(s => s.fps);

  const result: OverlayPerfResult = {
    avgCpuUsage: cpuUsages.reduce((sum, u) => sum + u, 0) / cpuUsages.length,
    maxCpuUsage: Math.max(...cpuUsages),
    avgFps: fpsValues.reduce((sum, f) => sum + f, 0) / fpsValues.length,
    minFps: Math.min(...fpsValues),
    fpsBelow60Count: fpsValues.filter(f => f < 60).length,
    cpuSamples,
    fpsSamples,
  };

  return result;
}

function printResults(result: OverlayPerfResult) {
  console.log('\n📊 Overlay Performance Benchmark Results:');
  console.log('========================================');
  console.log(`Average CPU Usage:   ${result.avgCpuUsage.toFixed(2)}%`);
  console.log(`Maximum CPU Usage:   ${result.maxCpuUsage.toFixed(2)}%`);
  console.log(`Average FPS:         ${result.avgFps.toFixed(1)}`);
  console.log(`Minimum FPS:         ${result.minFps}`);
  console.log(`Frames Below 60:     ${result.fpsBelow60Count}/${result.fpsSamples.length}`);
  console.log('========================================');
  
  const cpuCompliant = result.avgCpuUsage <= 5;
  const fpsCompliant = result.avgFps >= 55 && result.fpsBelow60Count === 0;
  
  console.log(cpuCompliant 
    ? '✅ CPU Compliance: PASSED (<= 5%)' 
    : '❌ CPU Compliance: FAILED (> 5%)');
  console.log(fpsCompliant 
    ? '✅ FPS Compliance: PASSED (>= 55 FPS, no drops below 60)' 
    : '❌ FPS Compliance: FAILED');
}

async function main() {
  try {
    const result = await runOverlayPerfTest(30000);
    printResults(result);
  } catch (error) {
    console.error('❌ Benchmark failed:', error);
    process.exit(1);
  }
}

main();