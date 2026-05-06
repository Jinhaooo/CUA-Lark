import { performance } from 'perf_hooks';

const tests = {
  'pause-resume-flow': async () => {
    const { default: run } = await import('./pause-resume-flow');
    await run();
  },
  'risk-confirm-flow': async () => {
    const { default: run } = await import('./risk-confirm-flow');
    await run();
  },
  'multi-subscriber-flow': async () => {
    const { default: run } = await import('./multi-subscriber-flow');
    await run();
  },
};

async function main() {
  const testName = process.argv[2];
  
  if (!testName) {
    console.log('Usage: tsx scripts/e2e/index.ts <test-name>');
    console.log('Available tests:', Object.keys(tests).join(', '));
    process.exit(1);
  }

  if (!tests[testName as keyof typeof tests]) {
    console.log(`Unknown test: ${testName}`);
    console.log('Available tests:', Object.keys(tests).join(', '));
    process.exit(1);
  }

  console.log(`\n🏃 Running e2e test: ${testName}`);
  console.log('==================================\n');

  const startTime = performance.now();
  
  try {
    await tests[testName as keyof typeof tests]();
    const duration = performance.now() - startTime;
    console.log(`\n⏱️ Test completed in ${duration.toFixed(2)}ms`);
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

main();