import { Verifier } from '../Verifier';
import { Context, VerifySpec } from '../../types';

describe('Verifier', () => {
  let verifier: Verifier;
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

    verifier = new Verifier(mockModel);
  });

  test('should throw error for ocr kind', async () => {
    const spec: VerifySpec = {
      kind: 'ocr',
      contains: 'test'
    };

    await expect(verifier.run(spec, mockContext)).rejects.toThrow('待 M3+ 接入：kind=ocr');
  });

  test('should throw error for pixel kind', async () => {
    const spec: VerifySpec = {
      kind: 'pixel',
      refImage: 'test.png',
      threshold: 0.9
    };

    await expect(verifier.run(spec, mockContext)).rejects.toThrow('待 M3+ 接入：kind=pixel');
  });

  test('should throw error for a11y kind', async () => {
    const spec: VerifySpec = {
      kind: 'a11y',
      role: 'button',
      name: 'test'
    };

    await expect(verifier.run(spec, mockContext)).rejects.toThrow('待 M3+ 接入：kind=a11y');
  });
});