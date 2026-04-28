#!/usr/bin/env python3
"""
OCR Bridge Service - CUA-Lark
FastAPI server for OCR recognition using PaddleOCR with RapidOCR fallback
"""

import json
import os
import sys
from typing import List, Dict, Any, Optional, Tuple
from http import HTTPStatus

from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware

try:
    from paddleocr import PaddleOCR
    PADDLE_AVAILABLE = True
except ImportError:
    PADDLE_AVAILABLE = False

try:
    from rapidocr_onnxruntime import RapidOCR
    RAPIDOCR_AVAILABLE = True
except ImportError:
    RAPIDOCR_AVAILABLE = False

app = FastAPI(title="CUA-Lark OCR Bridge", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# OCR engines
paddle_ocr = None
rapid_ocr = None
current_engine = "none"

def levenshtein_distance(a: str, b: str) -> int:
    """Calculate Levenshtein distance between two strings."""
    if len(a) < len(b):
        return levenshtein_distance(b, a)
    
    if len(b) == 0:
        return len(a)
    
    previous_row = list(range(len(b) + 1))
    for i, char_a in enumerate(a):
        current_row = [i + 1]
        for j, char_b in enumerate(b):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (char_a != char_b)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row
    
    return previous_row[-1]

def fuzzy_contains(haystack: str, needle: str, max_distance: int = 1) -> bool:
    """Check if needle is contained in haystack with allowed edit distance."""
    if not needle:
        return True
    if len(needle) <= max_distance:
        return needle in haystack
    
    needle_len = len(needle)
    for i in range(len(haystack) - needle_len + 1):
        substring = haystack[i:i + needle_len]
        if levenshtein_distance(substring, needle) <= max_distance:
            return True
    return False

def init_ocr():
    """Initialize OCR engines."""
    global paddle_ocr, rapid_ocr, current_engine
    
    # Try PaddleOCR first
    if PADDLE_AVAILABLE:
        try:
            paddle_ocr = PaddleOCR(use_angle_cls=True, lang='ch')
            current_engine = "paddleocr"
            print("[INFO] Using PaddleOCR engine", flush=True)
            return
        except Exception as e:
            print(f"[WARN] PaddleOCR initialization failed: {e}", flush=True)
    
    # Fallback to RapidOCR
    if RAPIDOCR_AVAILABLE:
        try:
            rapid_ocr = RapidOCR()
            current_engine = "rapidocr_fallback"
            print("[INFO] Using RapidOCR fallback engine", flush=True)
            return
        except Exception as e:
            print(f"[WARN] RapidOCR initialization failed: {e}", flush=True)
    
    print("[ERROR] No OCR engine available", flush=True)

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "ok" if current_engine != "none" else "unavailable",
        "engine": current_engine,
        "paddle_available": PADDLE_AVAILABLE,
        "rapidocr_available": RAPIDOCR_AVAILABLE
    }

@app.post("/recognize")
async def recognize(image: UploadFile = File(...)):
    """
    Recognize text from image.
    
    Args:
        image: Image file (PNG, JPG, etc.)
    
    Returns:
        List of OCR tokens with text, bounding box, and confidence
    """
    if current_engine == "none":
        raise HTTPException(
            status_code=HTTPStatus.SERVICE_UNAVAILABLE,
            detail="No OCR engine available"
        )
    
    try:
        image_data = await image.read()
        
        if current_engine == "paddleocr" and paddle_ocr:
            result = paddle_ocr.ocr(image_data, cls=True)
            tokens = []
            for line in result:
                if line:
                    for item in line:
                        box = item[0]
                        text = item[1][0]
                        confidence = item[1][1]
                        tokens.append({
                            "text": text,
                            "box": [int(box[0][0]), int(box[0][1]), int(box[2][0]), int(box[2][1])],
                            "confidence": float(confidence)
                        })
            return tokens
        
        elif current_engine == "rapidocr_fallback" and rapid_ocr:
            result, _ = rapid_ocr(image_data)
            tokens = []
            for item in result:
                text, box, confidence = item
                tokens.append({
                    "text": text,
                    "box": [int(box[0][0]), int(box[0][1]), int(box[2][0]), int(box[2][1])],
                    "confidence": float(confidence)
                })
            return tokens
        
        return []
    
    except Exception as e:
        raise HTTPException(
            status_code=HTTPStatus.INTERNAL_SERVER_ERROR,
            detail=f"OCR recognition failed: {str(e)}"
        )

@app.post("/locate")
async def locate(image: UploadFile = File(...), target: str = Form(...)):
    """
    Locate target text in image.
    
    Args:
        image: Image file
        target: Target text to find
    
    Returns:
        Bounding box of the found text or null if not found
    """
    tokens = await recognize(image)
    
    for token in tokens:
        if fuzzy_contains(token["text"], target):
            return {"box": token["box"]}
    
    return {"box": None}

if __name__ == "__main__":
    import uvicorn
    
    port = int(os.environ.get("CUA_OCR_PORT", 7010))
    host = os.environ.get("CUA_OCR_HOST", "0.0.0.0")
    
    print(f"[INFO] Initializing OCR engines...", flush=True)
    init_ocr()
    
    print(f"[INFO] Starting OCR Bridge on http://{host}:{port}", flush=True)
    uvicorn.run(app, host=host, port=port)