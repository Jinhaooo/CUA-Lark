export function fuzzyDistance(a: string, b: string): number {
  const aLen = a.length;
  const bLen = b.length;

  if (aLen === 0) return bLen;
  if (bLen === 0) return aLen;

  const prevRow: number[] = new Array(bLen + 1);
  for (let j = 0; j <= bLen; j++) {
    prevRow[j] = j;
  }

  for (let i = 1; i <= aLen; i++) {
    const currRow: number[] = new Array(bLen + 1);
    currRow[0] = i;
    for (let j = 1; j <= bLen; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      const prevJ = prevRow[j];
      const currJMinus1 = currRow[j - 1];
      const prevJMinus1 = prevRow[j - 1];
      currRow[j] = Math.min(
        (prevJ ?? 0) + 1,
        (currJMinus1 ?? 0) + 1,
        (prevJMinus1 ?? 0) + cost
      );
    }
    for (let j = 0; j <= bLen; j++) {
      prevRow[j] = currRow[j] ?? 0;
    }
  }

  return prevRow[bLen] ?? 0;
}

export function fuzzyContains(haystack: string, needle: string): boolean {
  const needleLen = needle.length;
  const haystackLen = haystack.length;

  if (needleLen === 0) {
    return true;
  }

  if (needleLen <= 1) {
    return haystack.includes(needle);
  }

  if (haystackLen === 0) {
    return false;
  }

  for (const windowLen of [needleLen - 1, needleLen, needleLen + 1]) {
    if (windowLen <= 0 || windowLen > haystackLen) {
      continue;
    }

    for (let i = 0; i <= haystackLen - windowLen; i++) {
      const slice = haystack.slice(i, i + windowLen);
      const distance = fuzzyDistance(slice, needle);
      if (distance <= 1) {
        return true;
      }
    }
  }

  return false;
}
