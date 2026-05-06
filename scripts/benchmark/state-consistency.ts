import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:7878';

interface ConsistencyCheck {
  check: string;
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
}

interface ConsistencyResult {
  checks: ConsistencyCheck[];
  passed: boolean;
  timestamp: number;
}

async function checkTaskStatusConsistency(): Promise<ConsistencyCheck> {
  try {
    const [tasksRes, statusRes] = await Promise.all([
      fetch(`${BASE_URL}/tasks`),
      fetch(`${BASE_URL}/tasks/status`),
    ]);

    const tasks = await tasksRes.json();
    const status = await statusRes.json();

    const taskIdsFromList = new Set((tasks.tasks || []).map((t: { id: string }) => t.id));
    const taskIdsFromStatus = new Set(Object.keys(status.status || {}));

    const consistent = taskIdsFromList.size === taskIdsFromStatus.size &&
      [...taskIdsFromList].every(id => taskIdsFromStatus.has(id));

    return {
      check: 'Task Status Consistency',
      passed: consistent,
      message: consistent 
        ? 'Task IDs match between tasks list and status endpoint'
        : 'Mismatch between tasks list and status endpoint',
      details: {
        tasksCount: taskIdsFromList.size,
        statusCount: taskIdsFromStatus.size,
        missingInStatus: [...taskIdsFromList].filter(id => !taskIdsFromStatus.has(id)),
        missingInTasks: [...taskIdsFromStatus].filter(id => !taskIdsFromList.has(id)),
      },
    };
  } catch (error) {
    return {
      check: 'Task Status Consistency',
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : 'Unknown'}`,
    };
  }
}

async function checkPauseControllerState(): Promise<ConsistencyCheck> {
  try {
    const response = await fetch(`${BASE_URL}/benchmarks/state-consistency`);
    const data = await response.json();

    return {
      check: 'Pause Controller State',
      passed: data.consistent,
      message: data.consistent 
        ? 'Pause controller state is consistent'
        : `Inconsistency detected: ${data.reason}`,
      details: data.details,
    };
  } catch (error) {
    return {
      check: 'Pause Controller State',
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : 'Unknown'}`,
    };
  }
}

async function checkSseEventOrder(): Promise<ConsistencyCheck> {
  try {
    const response = await fetch(`${BASE_URL}/benchmarks/sse-order`);
    const data = await response.json();

    return {
      check: 'SSE Event Order',
      passed: data.ordered,
      message: data.ordered 
        ? 'SSE events are properly ordered'
        : `Event order violation detected: ${data.violation}`,
      details: data.events?.slice(-10),
    };
  } catch (error) {
    return {
      check: 'SSE Event Order',
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : 'Unknown'}`,
    };
  }
}

async function runConsistencyCheck(): Promise<ConsistencyResult> {
  console.log('🚀 Running state consistency checks...');

  const checks = await Promise.all([
    checkTaskStatusConsistency(),
    checkPauseControllerState(),
    checkSseEventOrder(),
  ]);

  const result: ConsistencyResult = {
    checks,
    passed: checks.every(c => c.passed),
    timestamp: Date.now(),
  };

  return result;
}

function printResults(result: ConsistencyResult) {
  console.log('\n📊 State Consistency Check Results:');
  console.log('==================================');
  
  result.checks.forEach((check) => {
    console.log(check.passed ? '✅' : '❌', check.check);
    console.log(`   ${check.message}`);
    if (check.details) {
      console.log('   Details:', JSON.stringify(check.details, null, 2));
    }
    console.log();
  });

  console.log('==================================');
  console.log(result.passed 
    ? '✅ All consistency checks PASSED' 
    : '❌ Some consistency checks FAILED');
}

async function main() {
  try {
    const result = await runConsistencyCheck();
    printResults(result);
  } catch (error) {
    console.error('❌ Consistency check failed:', error);
    process.exit(1);
  }
}

main();