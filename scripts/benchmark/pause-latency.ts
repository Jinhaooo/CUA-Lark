import { performance } from 'perf_hooks';
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:7878';

interface LatencyResult {
  round: number;
  requestStart: number;
  serverReceive: number;
  serverProcess: number;
  serverSend: number;
  clientReceive: number;
  totalLatency: number;
  serverProcessingTime: number;
  networkTime: number;
}

interface BenchmarkResult {
  avgLatency: number;
  minLatency: number;
  maxLatency: number;
  p95Latency: number;
  p99Latency: number;
  avgServerProcessingTime: number;
  avgNetworkTime: number;
  results: LatencyResult[];
}

async function runPauseLatencyTest(rounds: number = 100): Promise<BenchmarkResult> {
  console.log(`🚀 Starting pause latency benchmark with ${rounds} rounds...`);

  const results: LatencyResult[] = [];

  for (let i = 0; i < rounds; i++) {
    const requestStart = performance.now();
    
    const response = await fetch(`${BASE_URL}/benchmarks/pause-latency`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ round: i + 1 }),
    });

    const clientReceive = performance.now();
    const data = await response.json() as {
      serverReceive: number;
      serverProcess: number;
      serverSend: number;
    };

    const result: LatencyResult = {
      round: i + 1,
      requestStart,
      serverReceive: data.serverReceive,
      serverProcess: data.serverProcess,
      serverSend: data.serverSend,
      clientReceive,
      totalLatency: clientReceive - requestStart,
      serverProcessingTime: data.serverSend - data.serverReceive,
      networkTime: (data.serverReceive - requestStart) + (clientReceive - data.serverSend),
    };

    results.push(result);

    if ((i + 1) % 10 === 0) {
      console.log(`  Round ${i + 1}/${rounds} completed - Latency: ${result.totalLatency.toFixed(2)}ms`);
    }
  }

  const sortedLatencies = results.map(r => r.totalLatency).sort((a, b) => a - b);
  
  const result: BenchmarkResult = {
    avgLatency: results.reduce((sum, r) => sum + r.totalLatency, 0) / rounds,
    minLatency: sortedLatencies[0],
    maxLatency: sortedLatencies[rounds - 1],
    p95Latency: sortedLatencies[Math.floor(rounds * 0.95)],
    p99Latency: sortedLatencies[Math.floor(rounds * 0.99)],
    avgServerProcessingTime: results.reduce((sum, r) => sum + r.serverProcessingTime, 0) / rounds,
    avgNetworkTime: results.reduce((sum, r) => sum + r.networkTime, 0) / rounds,
    results,
  };

  return result;
}

function printResults(result: BenchmarkResult) {
  console.log('\n📊 Pause Latency Benchmark Results:');
  console.log('==================================');
  console.log(`Average Latency:    ${result.avgLatency.toFixed(2)}ms`);
  console.log(`Minimum Latency:    ${result.minLatency.toFixed(2)}ms`);
  console.log(`Maximum Latency:    ${result.maxLatency.toFixed(2)}ms`);
  console.log(`P95 Latency:        ${result.p95Latency.toFixed(2)}ms`);
  console.log(`P99 Latency:        ${result.p99Latency.toFixed(2)}ms`);
  console.log(`Avg Server Time:    ${result.avgServerProcessingTime.toFixed(2)}ms`);
  console.log(`Avg Network Time:   ${result.avgNetworkTime.toFixed(2)}ms`);
  console.log('==================================');
  
  const c19Compliant = result.p95Latency <= 200;
  console.log(c19Compliant 
    ? '✅ C19 Compliance: PASSED (P95 <= 200ms)' 
    : '❌ C19 Compliance: FAILED (P95 > 200ms)');
}

async function main() {
  try {
    const result = await runPauseLatencyTest(100);
    printResults(result);
  } catch (error) {
    console.error('❌ Benchmark failed:', error);
    process.exit(1);
  }
}

main();