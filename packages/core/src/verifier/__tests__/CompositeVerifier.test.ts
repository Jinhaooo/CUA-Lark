import { CompositeVerifier } from '../CompositeVerifier';
import { Context, VerifySpec } from '../../types';

describe('CompositeVerifier', () => {
  let verifier: CompositeVerifier;
  let mockVerifier: any;
  let mockContext: Context;

  beforeEach(() => {
    mockVerifier = {
      run: jest.fn()
    };
    
    mockContext = {
      snapshot: jest.fn(),
      operator: {},
      agent: {},
      registry: {},
      model: {},
      trace: {},
      ocr: null,
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
      },
      config: {},
      runSkill: jest.fn()
    } as any;

    verifier = new CompositeVerifier(mockVerifier);
  });

  test('should return PASS for ALL when all verifications pass', async () => {
    (mockVerifier.run as jest.Mock)
      .mockResolvedValueOnce({ passed: true, reason: 'First passed' })
      .mockResolvedValueOnce({ passed: true, reason: 'Second passed' });

    const spec: VerifySpec = {
      kind: 'all',
      of: [
        { kind: 'vlm', prompt: 'First check' },
        { kind: 'vlm', prompt: 'Second check' }
      ]
    };

    const result = await verifier.run(spec as any, mockContext);
    expect(result.passed).toBe(true);
    expect(result.reason).toBe('All verifications passed');
  });

  test('should return FAIL for ALL when any verification fails', async () => {
    (mockVerifier.run as jest.Mock)
      .mockResolvedValueOnce({ passed: true, reason: 'First passed' })
      .mockResolvedValueOnce({ passed: false, reason: 'Second failed' });

    const spec: VerifySpec = {
      kind: 'all',
      of: [
        { kind: 'vlm', prompt: 'First check' },
        { kind: 'vlm', prompt: 'Second check' }
      ]
    };

    const result = await verifier.run(spec as any, mockContext);
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('One verification failed: Second failed');
  });

  test('should return PASS for ANY when any verification passes', async () => {
    (mockVerifier.run as jest.Mock)
      .mockResolvedValueOnce({ passed: false, reason: 'First failed' })
      .mockResolvedValueOnce({ passed: true, reason: 'Second passed' });

    const spec: VerifySpec = {
      kind: 'any',
      of: [
        { kind: 'vlm', prompt: 'First check' },
        { kind: 'vlm', prompt: 'Second check' }
      ]
    };

    const result = await verifier.run(spec as any, mockContext);
    expect(result.passed).toBe(true);
    expect(result.reason).toBe('At least one verification passed: Second passed');
  });

  test('should return FAIL for ANY when all verifications fail', async () => {
    (mockVerifier.run as jest.Mock)
      .mockResolvedValueOnce({ passed: false, reason: 'First failed' })
      .mockResolvedValueOnce({ passed: false, reason: 'Second failed' });

    const spec: VerifySpec = {
      kind: 'any',
      of: [
        { kind: 'vlm', prompt: 'First check' },
        { kind: 'vlm', prompt: 'Second check' }
      ]
    };

    const result = await verifier.run(spec as any, mockContext);
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('None of the verifications passed');
  });

  test('should handle empty specifications', async () => {
    const allSpec: VerifySpec = {
      kind: 'all',
      of: []
    };

    const anySpec: VerifySpec = {
      kind: 'any',
      of: []
    };

    const allResult = await verifier.run(allSpec as any, mockContext);
    expect(allResult.passed).toBe(false);
    expect(allResult.reason).toBe('No specifications provided for ALL verification');

    const anyResult = await verifier.run(anySpec as any, mockContext);
    expect(anyResult.passed).toBe(true);
    expect(anyResult.reason).toBe('No specifications provided for ANY verification');
  });
});