/**
 * Parse a SKILL.md markdown body into structured sections.
 *
 * Recognises H2 headings with multilingual aliases:
 *   - taskDetails:    任务目标 / 任务说明 / Description / (leading paragraph)
 *   - finishCriteria: 完成判据 / Completion Criteria / Finish Criteria
 *   - anchors:        锚点状态 / Anchors
 *   - pitfalls:       常见陷阱 / Common Pitfalls
 *
 * Unknown H2 sections are appended to taskDetails so nothing is silently
 * dropped. Empty input returns {} (callers must tolerate missing fields).
 */
export interface ParsedSkillBody {
  taskDetails?: string;
  finishCriteria?: string;
  anchors?: string;
  pitfalls?: string;
}

const ALIASES: Record<keyof ParsedSkillBody, string[]> = {
  taskDetails: ['任务目标', '任务说明', 'description', 'task'],
  finishCriteria: ['完成判据', 'completion criteria', 'finish criteria'],
  anchors: ['锚点状态', 'anchors'],
  pitfalls: ['常见陷阱', 'common pitfalls'],
};

function classifyHeading(headingText: string): keyof ParsedSkillBody | null {
  const norm = headingText.trim().toLowerCase();
  for (const [key, aliases] of Object.entries(ALIASES) as [
    keyof ParsedSkillBody,
    string[],
  ][]) {
    if (aliases.some((a) => norm === a.toLowerCase())) return key;
  }
  return null;
}

export function parseSkillBody(markdownBody: string): ParsedSkillBody {
  if (!markdownBody || !markdownBody.trim()) return {};

  // Split into segments on H2 boundaries. Keep the leading content
  // (before any H2) as a "preface" classified as taskDetails by default.
  // H1 headings are stripped (just titles).
  const lines = markdownBody.split(/\r?\n/);
  const segments: { heading: string | null; body: string[] }[] = [
    { heading: null, body: [] },
  ];

  for (const line of lines) {
    const h2 = /^##\s+(.+?)\s*$/.exec(line);
    const h1 = /^#\s+(.+?)\s*$/.exec(line);
    if (h2) {
      segments.push({ heading: h2[1]!, body: [] });
    } else if (h1) {
      // H1 is a top title — skip the line, content continues in current segment
    } else {
      segments[segments.length - 1]!.body.push(line);
    }
  }

  const result: ParsedSkillBody = {};
  const unknownSections: string[] = [];

  for (const seg of segments) {
    const text = seg.body.join('\n').trim();
    if (!text) continue;

    if (seg.heading === null) {
      // Preface (before any H2) → taskDetails
      result.taskDetails = appendSection(result.taskDetails, text);
      continue;
    }

    const key = classifyHeading(seg.heading);
    if (key) {
      result[key] = appendSection(result[key], text);
    } else {
      // Unknown H2 → fold into taskDetails so nothing is lost
      unknownSections.push(`## ${seg.heading}\n\n${text}`);
    }
  }

  if (unknownSections.length > 0) {
    result.taskDetails = appendSection(result.taskDetails, unknownSections.join('\n\n'));
  }

  return result;
}

function appendSection(existing: string | undefined, addition: string): string {
  return existing ? `${existing}\n\n${addition}` : addition;
}
