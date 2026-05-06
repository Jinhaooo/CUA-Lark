import { EventSource } from 'eventsource';

const BASE_URL = 'http://localhost:7878';

interface TestResult {
  test: string;
  passed: boolean;
  message: string;
  durationMs: number;
}

async function testMultiSubscriberFlow(): Promise<TestResult> {
  const startTime = Date.now();
  
  console.log('🔄 Starting multi-subscriber flow test...');

  return new Promise((resolve) => {
    const eventsReceived: Record<string, number> = {};
    const subscriberCount = 3;
    const connectedCount = { value: 0 };
    const completedCount = { value: 0 };

    const subscribers: EventSource[] = [];

    for (let i = 0; i < subscriberCount; i++) {
      const es = new EventSource(`${BASE_URL}/stream`);
      subscribers.push(es);

      es.onopen = () => {
        connectedCount.value++;
        console.log(`  Subscriber ${i + 1} connected`);
        
        if (connectedCount.value === subscriberCount) {
          console.log('  All subscribers connected, triggering test event...');
          
          fetch(`${BASE_URL}/benchmarks/health`).catch(() => {});
        }
      };

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const kind = data.kind;
          
          if (!eventsReceived[kind]) {
            eventsReceived[kind] = 0;
          }
          eventsReceived[kind]++;

          if (kind === 'task_finished' || kind === 'task_failed') {
            completedCount.value++;
            es.close();

            if (completedCount.value === subscriberCount) {
              const duration = Date.now() - startTime;
              const allReceivedSameEvents = Object.values(eventsReceived).every(count => count === subscriberCount);
              
              resolve({
                test: 'multi-subscriber-flow',
                passed: allReceivedSameEvents,
                message: allReceivedSameEvents 
                  ? `All ${subscriberCount} subscribers received identical events (${duration}ms)`
                  : `Event count mismatch: ${JSON.stringify(eventsReceived)}`,
                durationMs: duration,
              });
            }
          }
        } catch {
          // Ignore parse errors
        }
      };

      es.onerror = () => {
        es.close();
        completedCount.value++;
        
        if (completedCount.value === subscriberCount) {
          const duration = Date.now() - startTime;
          resolve({
            test: 'multi-subscriber-flow',
            passed: false,
            message: `One or more subscribers failed (${duration}ms)`,
            durationMs: duration,
          });
        }
      };
    }

    setTimeout(() => {
      subscribers.forEach(es => es.close());
      const duration = Date.now() - startTime;
      resolve({
        test: 'multi-subscriber-flow',
        passed: false,
        message: `Test timed out (${duration}ms)`,
        durationMs: duration,
      });
    }, 30000);
  });
}

async function main() {
  const result = await testMultiSubscriberFlow();
  
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