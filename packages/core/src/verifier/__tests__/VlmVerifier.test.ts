import { VlmVerifier } from '../VlmVerifier';
import { Context, VerifySpec } from '../../types';

describe('VlmVerifier', () => {
  let verifier: VlmVerifier;
  let mockModel: any;
  let mockContext: Context;

  beforeEach(() => {
    mockModel = {
      chatVision: jest.fn()
    };
    
    mockContext = {
      snapshot: jest.fn(),
      operator: {},
      agent: {},
      registry: {},
      model: mockModel,
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

    verifier = new VlmVerifier(mockModel);
  });

  test('should return PASS when model returns PASS', async () => {
    (mockContext.snapshot as jest.Mock).mockResolvedValue({
      screenshotBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    });

    (mockModel.chatVision as jest.Mock).mockResolvedValue({
      content: 'PASS: The element is visible'
    });

    const spec: VerifySpec = {
      kind: 'vlm',
      prompt: 'Is the button visible?'
    };

    const result = await verifier.run(spec as any, mockContext);
    expect(result.passed).toBe(true);
    expect(result.reason).toBe('PASS: The element is visible');
  });

  test('should return FAIL when model returns FAIL', async () => {
    (mockContext.snapshot as jest.Mock).mockResolvedValue({
      screenshotBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    });

    (mockModel.chatVision as jest.Mock).mockResolvedValue({
      content: 'FAIL: The button is not visible'
    });

    const spec: VerifySpec = {
      kind: 'vlm',
      prompt: 'Is the button visible?'
    };

    const result = await verifier.run(spec as any, mockContext);
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('FAIL: The button is not visible');
  });

  test('should return FAIL when no screenshot is available', async () => {
    (mockContext.snapshot as jest.Mock).mockResolvedValue({});

    const spec: VerifySpec = {
      kind: 'vlm',
      prompt: 'Is the button visible?'
    };

    const result = await verifier.run(spec as any, mockContext);
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('No screenshot available for VLM verification');
  });

  test('should return FAIL when model throws error', async () => {
    (mockContext.snapshot as jest.Mock).mockResolvedValue({
      screenshotBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    });

    (mockModel.chatVision as jest.Mock).mockRejectedValue(new Error('Model error'));

    const spec: VerifySpec = {
      kind: 'vlm',
      prompt: 'Is the button visible?'
    };

    const result = await verifier.run(spec as any, mockContext);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('Model error');
  });
});