import { locateImInput, locateSearchButton } from '../locate.js';
import { SkillError } from '@cua-lark/core';

class MockOperator {
  find = {
    byIntent: jest.fn(),
  };
}

describe('locate helpers', () => {
  it('locateImInput should return box when found', async () => {
    const operator = new MockOperator();
    operator.find.byIntent.mockResolvedValue({ box: { x1: 0, y1: 0, x2: 100, y2: 50 } });

    const result = await locateImInput(operator as any);

    expect(result).toEqual({ x1: 0, y1: 0, x2: 100, y2: 50 });
  });

  it('locateImInput should throw when not found', async () => {
    const operator = new MockOperator();
    operator.find.byIntent.mockResolvedValue(null);

    await expect(locateImInput(operator as any)).rejects.toThrow(SkillError);
  });

  it('locateSearchButton should return box when found', async () => {
    const operator = new MockOperator();
    operator.find.byIntent.mockResolvedValue({ box: { x1: 10, y1: 10, x2: 50, y2: 50 } });

    const result = await locateSearchButton(operator as any);

    expect(result).toEqual({ x1: 10, y1: 10, x2: 50, y2: 50 });
  });
});