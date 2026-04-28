import type { OcrToken, Box } from './types.js';

export class OcrClient {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  async recognize(image: Buffer, region?: Box): Promise<OcrToken[]> {
    const form = new FormData();
    form.append('image', new Blob([image]), 'image.png');

    const response = await fetch(`${this.baseURL}/recognize`, {
      method: 'POST',
      body: form,
    });

    if (!response.ok) {
      throw new Error(`OCR recognize failed: ${response.statusText}`);
    }

    const tokens: OcrToken[] = await response.json();
    
    if (region) {
      return tokens.filter(token => this.isBoxOverlapping(token.box, region));
    }
    
    return tokens;
  }

  async locate(image: Buffer, target: string): Promise<Box | null> {
    const form = new FormData();
    form.append('image', new Blob([image]), 'image.png');
    form.append('target', target);

    const response = await fetch(`${this.baseURL}/locate`, {
      method: 'POST',
      body: form,
    });

    if (!response.ok) {
      throw new Error(`OCR locate failed: ${response.statusText}`);
    }

    const result = await response.json();
    if (!result.box) {
      return null;
    }

    const [x1, y1, x2, y2] = result.box;
    return { x1, y1, x2, y2 };
  }

  private isBoxOverlapping(tokenBox: [number, number, number, number], region: Box): boolean {
    const [tX1, tY1, tX2, tY2] = tokenBox;
    return !(tX2 < region.x1 || tX1 > region.x2 || tY2 < region.y1 || tY1 > region.y2);
  }
}