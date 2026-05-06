import { performance } from 'perf_hooks';

const benchmarks = {
  'pause-latency': async () => {
    const { default: run } = await import('./pause-latency');
    await run();
  },
  'overlay-perf': async () => {
    const { default: run } = await import('./overlay-perf');
    await run();
  },
  'state-consistency': async () => {
    const { default: run } = await import('./state-consistency');
    await run();
  },
};

async function main() {
  const benchmarkName = process.argv[2];
  
  if (!benchmarkName) {
    console.log('Usage: tsx scripts/benchmark/index.ts <benchmark-name>');
    console.log('Available benchmarks:', Object.keys(benchmarks).join(', '));
    process.exit(1);
  }

  if (!benchmarks[benchmarkName as keyof typeof benchmarks]) {
    console.log(`Unknown benchmark: ${benchmarkName}`);
    console.log('Available benchmarks:', Object.keys(benchmarks).join(', '));
    process.exit(1);
  }

  console.log(`\n🏃 Running benchmark: ${benchmarkName}`);
  console.log('==================================\n');

  const startTime = performance.now();
  
  try {
    await benchmarks[benchmarkName as keyof typeof benchmarks]();
    const duration = performance.now() - startTime;
    console.log(`\n⏱️ Benchmark completed in ${duration.toFixed(2)}ms`);
  } catch (error) {
    console.error('❌ Benchmark failed:', error);
    process.exit(1);
  }
}

main();