# OCR Bridge

OCR Bridge service for CUA-Lark, providing text recognition and location capabilities.

## Prerequisites

- Python 3.10+
- pip package manager

## Installation

Install required Python packages:

```bash
pip install paddleocr fastapi uvicorn rapidocr_onnxruntime pillow
```

**Note**: The first run will automatically download PaddleOCR models (~200MB).

## Running the Service

### Manually

```bash
python server.py
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| CUA_OCR_PORT | 7010 | Port to listen on |
| CUA_OCR_HOST | 0.0.0.0 | Host to bind to |

## API Endpoints

### POST /recognize

Recognize text from image.

**Request:**
```
Content-Type: multipart/form-data
Form fields:
  - image: binary (PNG, JPG, etc.)
```

**Response:**
```json
[
  {
    "text": "Hello World",
    "box": [x1, y1, x2, y2],
    "confidence": 0.95
  }
]
```

### POST /locate

Locate target text in image using fuzzy matching (Levenshtein distance ≤ 1).

**Request:**
```
Content-Type: multipart/form-data
Form fields:
  - image: binary
  - target: string
```

**Response:**
```json
{
  "box": [x1, y1, x2, y2]
}
```
or
```json
{
  "box": null
}
```

### GET /health

Check service health.

**Response:**
```json
{
  "status": "ok",
  "engine": "paddleocr",
  "paddle_available": true,
  "rapidocr_available": true
}
```

## OCR Engine Priority

1. **PaddleOCR** (PP-OCRv4) - Primary engine
2. **RapidOCR** - Fallback if PaddleOCR fails to initialize

## TypeScript Client

```typescript
import { OcrBridgeProcess, OcrClient } from '@cua-lark/ocr-bridge';

// Start the bridge process
const bridge = new OcrBridgeProcess();
await bridge.start();

// Create OCR client
const client = new OcrClient(bridge.getBaseURL());

// Recognize text
const tokens = await client.recognize(imageBuffer);

// Locate text
const box = await client.locate(imageBuffer, 'target text');
```

## Notes

- The OCR bridge runs as a separate Python process
- Process crashes are not automatically restarted (M5 feature)
- All image processing is done on the Python side
- Fuzzy matching allows 1 character edit distance