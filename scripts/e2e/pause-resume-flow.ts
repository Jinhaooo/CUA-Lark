import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:7878';

interface TestResult {
  test: string;
  passed: boolean;
  message: string;
  durationMs: number;
}

async function testPauseResumeFlow(): Promise<TestResult> {
  const startTime = Date.now();
  
  console.log('🔄 Starting pause-resume flow test...');

  try {
    console.log('  Step 1: Creating task...');
    const createResponse = await fetch(`${BASE_URL}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skillName: 'test_pause_resume',
        params: { test: true },
      }),
    });

    if (!createResponse.ok) {
      throw new Error(`Failed to create task: ${createResponse.statusText}`);
    }

    const createData = await createResponse.json();
    const taskId = createData.taskId;
    console.log(`  Task created: ${taskId}`);

    await new Promise(resolve => setTimeout(resolve, 500));

    console.log('  Step 2: Pausing task...');
    const pauseResponse = await fetch(`${BASE_URL}/tasks/${taskId}/pause`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'test' }),
    });

    if (!pauseResponse.ok) {
      throw new Error(`Failed to pause task: ${pauseResponse.statusText}`);
    }

    const pauseData = await pauseResponse.json();
    if (!pauseData.paused) {
      throw new Error('Task was not paused');
    }
    console.log('  Task paused successfully');

    await new Promise(resolve => setTimeout(resolve, 300));

    console.log('  Step 3: Resuming task...');
    const resumeResponse = await fetch(`${BASE_URL}/tasks/${taskId}/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!resumeResponse.ok) {
      throw new Error(`Failed to resume task: ${resumeResponse.statusText}`);
    }

    const resumeData = await resumeResponse.json();
    if (!resumeData.resumed) {
      throw new Error('Task was not resumed');
    }
    console.log('  Task resumed successfully');

    await new Promise(resolve => setTimeout(resolve, 500));

    console.log('  Step 4: Verifying task status...');
    const statusResponse = await fetch(`${BASE_URL}/tasks/${taskId}`);
    const statusData = await statusResponse.json();
    
    const finalStatus = statusData.status;
    console.log(`  Final task status: ${finalStatus}`);

    const duration = Date.now() - startTime;

    return {
      test: 'pause-resume-flow',
      passed: true,
      message: `Pause-resume flow completed successfully (${duration}ms)`,
      durationMs: duration,
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      test: 'pause-resume-flow',
      passed: false,
      message: `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      durationMs: duration,
    };
  }
}

async function main() {
  const result = await testPauseResumeFlow();
  
  console.log('\n📊 Test Results:');
  console.log('==================================');
  console.log(`Test: ${result.test}`);
  console.log(`Status: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Message: ${result.message}`);
  console.log(`Duration: ${result.durationMs}ms`);
  console.log('==================================');

  process.exit(result.passed ? 0 : 1);
}

main();