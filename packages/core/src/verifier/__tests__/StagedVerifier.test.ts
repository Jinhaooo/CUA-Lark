import { StagedVerifier } from '../StagedVerifier';
import type { Context, VerifySpec } from '../../types';

describe('StagedVerifier', () => {
  function context(): Context {
    return {
      operator: {},
      agent: {},
      registry: {},
      model: {},
      trace: {
        beginRun: jest.fn(),
        write: jest.fn().mockResolvedValue(undefined),
        endRun: jest.fn(),
        saveScreenshot: jest.fn(),
      },
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      },
      config: {},
    } as any;
  }

  test('passes on the first successful stage and short-circuits later stages', async () => {
    const runStage = jest.fn().mockResolvedValue({ passed: true, reason: 'fast ok' });
    const verifier = new StagedVerifier(runStage);
    const ctx = context();

    const result = await verifier.verify({
      kind: 'staged',
      stages: [
        { name: 'fast', spec: { kind: 'ocr', contains: 'x' } },
        { name: 'expensive', spec: { kind: 'vlm', prompt: 'x' } },
      ],
    }, ctx);

    expect(result.passed).toBe(true);
    expect(runStage).toHaveBeenCalledTimes(1);
    expect(ctx.trace.write).toHaveBeenCalledWith(expect.objectContaining({ kind: 'verify_stage_pass' }));
  });

  test('passes when the second stage rescues a failed first stage', async () => {
    const runStage = jest.fn()
      .mockResolvedValueOnce({ passed: false, reason: 'fast miss' })
      .mockResolvedValueOnce({ passed: true, reason: 'ocr ok' });
    const verifier = new StagedVerifier(runStage);
    const ctx = context();

    const result = await verifier.verify({
      kind: 'staged',
      stages: [
        { name: 'fast', spec: { kind: 'a11y', role: 'Text', name: 'x' } },
        { name: 'medium', spec: { kind: 'ocr', contains: 'x' } },
      ],
    }, ctx);

    expect(result.passed).toBe(true);
    expect(ctx.trace.write).toHaveBeenCalledWith(expect.objectContaining({ kind: 'verify_stage_fail' }));
    expect(ctx.trace.write).toHaveBeenCalledWith(expect.objectContaining({ kind: 'verify_stage_pass' }));
  });

  test('fails only when all stages fail', async () => {
    const runStage = jest.fn().mockResolvedValue({ passed: false, reason: 'miss' });
    const verifier = new StagedVerifier(runStage);
    const ctx = context();

    const spec: Extract<VerifySpec, { kind: 'staged' }> = {
      kind: 'staged',
      stages: [
        { name: 'fast', spec: { kind: 'ocr', contains: 'x' } },
        { name: 'expensive', spec: { kind: 'vlm', prompt: 'x' } },
      ],
    };
    const result = await verifier.verify(spec, ctx);

    expect(result.passed).toBe(false);
    expect(ctx.trace.write).toHaveBeenCalledWith(expect.objectContaining({ kind: 'verify_all_stages_failed' }));
  });

  test('treats a stage timeout as a failed stage and continues', async () => {
    const runStage = jest.fn()
      .mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve({ passed: true, reason: 'too late' }), 50)))
      .mockResolvedValueOnce({ passed: true, reason: 'rescued' });
    const verifier = new StagedVerifier(runStage);
    const ctx = context();

    const result = await verifier.verify({
      kind: 'staged',
      stages: [
        { name: 'fast', spec: { kind: 'ocr', contains: 'x' }, maxDurationMs: 1 },
        { name: 'medium', spec: { kind: 'vlm', prompt: 'x' }, maxDurationMs: 100 },
      ],
    }, ctx);

    expect(result.passed).toBe(true);
    expect(runStage).toHaveBeenCalledTimes(2);
  });
});
