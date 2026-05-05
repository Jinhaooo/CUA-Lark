import { z } from 'zod';
import type { Tool, HarnessContext, ToolResult } from '../types.js';
import type { ModelClient } from '../../model/types.js';

export interface FailureAnalysis {
  errorKind: string;
  rootCause: string;
  alternativeStrategy: string;
  confidence: number;
}

interface TraceEntry {
  iteration: number;
  thought: string;
  toolCall: { name: string; args?: unknown };
  observation: string;
}

const analysisPromptTemplate = `You are a failure analyst for a GUI automation agent controlling 飞书 (Lark) desktop client.

Given the following failed task trace, analyze the root cause and provide an alternative strategy.

## Recent Trace (last 10 entries):
{traceEntries}

## Task Failure Reason: {finishedReason}

## Current Screenshot: (see attached image)

Your task:
1. Identify what went wrong based on the trace
2. Determine the error kind (locator_failed / verification_failed / unexpected_ui / permission_denied / etc.)
3. Suggest a concrete alternative strategy

Respond in JSON format:
{
  "errorKind": "string",
  "rootCause": "string (max 200 chars)",
  "alternativeStrategy": "string (max 500 chars)",
  "confidence": number (0.0 to 1.0)
}

Rules:
- confidence < 0.5 means the analysis is uncertain, do not retry
- rootCause must be specific and actionable
- alternativeStrategy must be a concrete suggestion, not a generic retry`;

export const failureAnalystTool: Tool<{
  trace: TraceEntry[];
  finishedReason: string;
  screenshotBase64?: string;
}, FailureAnalysis> = {
  name: 'failure_analyst',
  description: 'Analyze a failed task trace to identify root cause and suggest alternative strategy.',
  argsSchema: z.object({
    trace: z.array(z.object({
      iteration: z.number(),
      thought: z.string(),
      toolCall: z.object({
        name: z.string(),
        args: z.any(),
      }),
      observation: z.string(),
    })),
    finishedReason: z.string(),
    screenshotBase64: z.string().optional(),
  }),
  async execute(
    ctx: HarnessContext,
    args: { trace: TraceEntry[]; finishedReason: string; screenshotBase64?: string }
  ): Promise<ToolResult<FailureAnalysis>> {
    try {
      const model = ctx.model;

      const traceEntries = args.trace
        .slice(-10)
        .map((entry) => `[Iter ${entry.iteration}]
Thought: ${entry.thought}
Tool: ${entry.toolCall.name}(${JSON.stringify(entry.toolCall.args)})
Obs: ${entry.observation}`)
        .join('\n\n');

      const prompt = analysisPromptTemplate
        .replace('{traceEntries}', traceEntries)
        .replace('{finishedReason}', args.finishedReason);

      const messages: any[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
          ],
        },
      ];

      if (args.screenshotBase64) {
        messages[0].content.push({
          type: 'image_url',
          image_url: { url: `data:image/png;base64,${args.screenshotBase64}` },
        });
      }

      const response = await model.chatText({
        messages,
        modelOverride: ctx.config.vlmModel,
        response_format: { type: 'json_object' },
      });

      let analysis: FailureAnalysis;
      try {
        const parsed = JSON.parse(response.content);
        analysis = {
          errorKind: parsed.errorKind || 'unknown',
          rootCause: (parsed.rootCause || '').substring(0, 200),
          alternativeStrategy: (parsed.alternativeStrategy || '').substring(0, 500),
          confidence: Math.max(0, Math.min(1, parseFloat(parsed.confidence) || 0.5)),
        };
      } catch {
        analysis = {
          errorKind: 'analysis_parse_failed',
          rootCause: 'Failed to parse failure analyst response',
          alternativeStrategy: 'Review trace manually',
          confidence: 0,
        };
      }

      return {
        success: true,
        data: analysis,
        observation: `Failure analysis: ${analysis.errorKind} (confidence: ${analysis.confidence}). Root cause: ${analysis.rootCause}. Suggestion: ${analysis.alternativeStrategy}`,
      };
    } catch (error) {
      return {
        success: false,
        observation: `Failure analyst error: ${error}`,
        error: { kind: 'unknown', message: String(error) },
      };
    }
  },
  category: 'verify',
  costHint: 'expensive',
};
