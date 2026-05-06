import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:7878';

interface TestResult {
  test: string;
  passed: boolean;
  message: string;
  durationMs: number;
}

async function testRiskConfirmFlow(): Promise<TestResult> {
  const startTime = Date.now();
  
  console.log('🔄 Starting risk-confirm flow test...');

  try {
    console.log('  Step 1: Creating task with risk...');
    const createResponse = await fetch(`${BASE_URL}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        skillName: 'test_risk_confirm',
        params: { requireConfirmation: true },
      }),
    });

    if (!createResponse.ok) {
      throw new Error(`Failed to create task: ${createResponse.statusText}`);
    }

    const createData = await createResponse.json();
    const taskId = createData.taskId;
    console.log(`  Task created: ${taskId}`);

    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('  Step 2: Checking for pending confirmations...');
    const confirmResponse = await fetch(`${BASE_URL}/confirm/pending/${taskId}`);
    
    if (!confirmResponse.ok) {
      throw new Error(`Failed to get pending confirmations: ${confirmResponse.statusText}`);
    }

    const pendingData = await confirmResponse.json();
    if (!pendingData.hasPending) {
      throw new Error('No pending confirmation found');
    }

    const confirmId = pendingData.confirmations?.[0]?.id;
    if (!confirmId) {
      throw new Error('No confirmation ID found');
    }
    console.log(`  Found pending confirmation: ${confirmId}`);

    console.log('  Step 3: Confirming risk...');
    const confirmActionResponse = await fetch(`${BASE_URL}/confirm/${confirmId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmed: true }),
    });

    if (!confirmActionResponse.ok) {
      throw new Error(`Failed to confirm: ${confirmActionResponse.statusText}`);
    }

    const confirmResult = await confirmActionResponse.json();
    if (!confirmResult.confirmed) {
      throw new Error('Confirmation not processed');
    }
    console.log('  Risk confirmed successfully');

    const duration = Date.now() - startTime;

    return {
      test: 'risk-confirm-flow',
      passed: true,
      message: `Risk-confirm flow completed successfully (${duration}ms)`,
      durationMs: duration,
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      test: 'risk-confirm-flow',
      passed: false,
      message: `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      durationMs: duration,
    };
  }
}

async function main() {
  const result = await testRiskConfirmFlow();
  
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