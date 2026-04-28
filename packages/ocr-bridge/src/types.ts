export interface OcrToken {
  text: string;
  box: [number, number, number, number];
  confidence: number;
}

export interface OcrClient {
  recognize(image: Buffer, region?: Box): Promise<OcrToken[]>;
  locate(image: Buffer, target: string): Promise<Box | null>;
}

export interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface OcrBridgeHealth {
  status: 'ok' | 'unavailable';
  engine: string;
  paddle_available: boolean;
  rapidocr_available: boolean;
}

export interface OcrBridgeProcessConfig {
  pythonPath?: string;
  port?: number;
  host?: string;
  serverScriptPath?: string;
}