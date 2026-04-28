#!/bin/bash

set -e

echo "=== M2 DO NOT Check ==="

# 检查 1: 禁止使用 OCR 相关功能（M3）
echo "\n1. Checking for OCR-related dependencies..."
OCR_FOUND=$(grep -rEn 'ocr-bridge|PaddleOCR|RapidOCR|paddleocr|rapidocr' packages/ || true)
if [ -n "$OCR_FOUND" ]; then
  echo "ERROR: OCR-related dependencies found (should be M3+)"
  echo "$OCR_FOUND"
  exit 1
else
  echo "✓ No OCR-related dependencies found"
fi

# 检查 2: 验证 VerifySpec 类型包含 ocr/pixel/a11y 分支
echo "\n2. Checking VerifySpec types..."
TYPES_FILE="packages/core/src/types.ts"
if [ -f "$TYPES_FILE" ]; then
  OCR_TYPE=$(grep -E "kind: 'ocr'" "$TYPES_FILE" || true)
  PIXEL_TYPE=$(grep -E "kind: 'pixel'" "$TYPES_FILE" || true)
  A11Y_TYPE=$(grep -E "kind: 'a11y'" "$TYPES_FILE" || true)
  
  if [ -n "$OCR_TYPE" ] && [ -n "$PIXEL_TYPE" ] && [ -n "$A11Y_TYPE" ]; then
    echo "✓ VerifySpec includes ocr/pixel/a11y types"
  else
    echo "ERROR: VerifySpec missing ocr/pixel/a11y types"
    exit 1
  fi
else
  echo "ERROR: $TYPES_FILE not found"
  exit 1
fi

# 检查 3: 验证 SkillKind 包含三个枚举
echo "\n3. Checking SkillKind enum..."
SKILL_TYPES_FILE="packages/core/src/skill/types.ts"
if [ -f "$SKILL_TYPES_FILE" ]; then
  SKILL_KIND=$(grep -E "'procedural' \| 'agent_driven' \| 'recorded'" "$SKILL_TYPES_FILE" || true)
  if [ -n "$SKILL_KIND" ]; then
    echo "✓ SkillKind includes all three enums"
  else
    echo "ERROR: SkillKind missing required enums"
    exit 1
  fi
else
  echo "ERROR: $SKILL_TYPES_FILE not found"
  exit 1
fi

# 检查 4: 禁止在测试用例中硬编码群名
echo "\n4. Checking for hardcoded test group names..."
HARCODED_GROUP=$(grep -rEn '测试群|CUA-Lark-Test' testcases/ || true)
if [ -n "$HARCODED_GROUP" ]; then
  echo "ERROR: Hardcoded test group names found in testcases"
  echo "$HARCODED_GROUP"
  exit 1
else
  echo "✓ No hardcoded test group names found"
fi

# 检查 5: 禁止业务代码直接 import openai
echo "\n5. Checking for direct openai imports..."
OPENAI_IMPORTS=$(grep -rEn "from ['\"]openai['\"]" packages/ --include='*.ts' | grep -v 'packages/core/src/model/' || true)
if [ -n "$OPENAI_IMPORTS" ]; then
  echo "ERROR: Direct openai imports found in business code"
  echo "$OPENAI_IMPORTS"
  exit 1
else
  echo "✓ No direct openai imports found in business code"
fi

# 检查 6: 禁止硬编码模型名
echo "\n6. Checking for hardcoded model names..."
HARDCODED_MODELS=$(grep -rEn 'doubao|qwen|gpt-4o|claude-3|ui-tars-' packages/skills/ packages/core/src/{verifier,skill,suite,trace}/ || true)
if [ -n "$HARDCODED_MODELS" ]; then
  echo "ERROR: Hardcoded model names found"
  echo "$HARDCODED_MODELS"
  exit 1
else
  echo "✓ No hardcoded model names found"
fi

# 检查 7: 禁止使用 SQLite（M4）
echo "\n7. Checking for SQLite dependencies..."
SQLITE_FOUND=$(grep -rEn 'drizzle|better-sqlite3' packages/ || true)
if [ -n "$SQLITE_FOUND" ]; then
  echo "ERROR: SQLite dependencies found (should be M4+)"
  echo "$SQLITE_FOUND"
  exit 1
else
  echo "✓ No SQLite dependencies found"
fi

echo "\n=== All checks passed! ==="
exit 0
