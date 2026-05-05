import type { HarnessTrace } from '../harness/types.js';
import type { EmbeddingClient, SearchResult } from './EmbeddingClient.js';

export interface FewShotExample {
  id: string;
  skillName: string;
  taskInstruction: string;
  trace: HarnessTrace[];
  success: boolean;
  finishedReason: string;
  embedding?: number[];
  createdAt: Date;
}

export interface MiningOptions {
  skillName?: string;
  minIterations?: number;
  maxIterations?: number;
  successOnly?: boolean;
  limit?: number;
}

export interface FewShotCandidate {
  example: FewShotExample;
  score: number;
  relevanceReason: string;
}

export class FewShotMiner {
  private embeddingClient: EmbeddingClient;
  private examples: Map<string, FewShotExample>;

  constructor(embeddingClient: EmbeddingClient) {
    this.embeddingClient = embeddingClient;
    this.examples = new Map();
  }

  registerExample(example: Omit<FewShotExample, 'embedding'>): FewShotExample {
    const fullExample: FewShotExample = {
      ...example,
      embedding: undefined,
    };

    this.examples.set(fullExample.id, fullExample);
    return fullExample;
  }

  async indexExample(exampleId: string): Promise<void> {
    const example = this.examples.get(exampleId);
    if (!example) {
      throw new Error(`Example ${exampleId} not found`);
    }

    const text = this.buildSearchableText(example);
    const result = await this.embeddingClient.embed(text);

    example.embedding = result.embedding;
  }

  private buildSearchableText(example: FewShotExample): string {
    const traceSummary = example.trace
      .slice(0, 5)
      .map((t) => `${t.toolCall?.name || 'unknown'}: ${t.thought?.slice(0, 100) || ''}`)
      .join(' | ');

    return `${example.taskInstruction} | ${example.skillName} | ${traceSummary}`;
  }

  async mine(
    query: string,
    options: MiningOptions = {}
  ): Promise<FewShotCandidate[]> {
    const minIterations = options.minIterations || 1;
    const maxIterations = options.maxIterations || 50;
    const successOnly = options.successOnly ?? true;
    const limit = options.limit || 10;

    const candidates = Array.from(this.examples.values())
      .filter((ex) => {
        if (options.skillName && ex.skillName !== options.skillName) {
          return false;
        }
        if (successOnly && !ex.success) {
          return false;
        }
        if (ex.trace.length < minIterations || ex.trace.length > maxIterations) {
          return false;
        }
        return true;
      });

    if (candidates.length === 0) {
      return [];
    }

    const needsIndexing = candidates.filter((c) => c.embedding === undefined);

    for (const candidate of needsIndexing) {
      await this.indexExample(candidate.id);
    }

    const indexedCandidates = candidates.filter((c) => c.embedding !== undefined);

    const results = await this.embeddingClient.search(
      indexedCandidates,
      query,
      (ex) => this.buildSearchableText(ex),
      { topK: limit }
    );

    return results.map((r: SearchResult<FewShotExample>) => ({
      example: r.item,
      score: r.score,
      relevanceReason: this.generateRelevanceReason(r.item, query),
    }));
  }

  private generateRelevanceReason(example: FewShotExample, query: string): string {
    const parts: string[] = [];

    if (example.skillName) {
      parts.push(`Skill: ${example.skillName}`);
    }

    const toolCount = example.trace.length;
    parts.push(`${toolCount} tool calls`);

    if (example.success) {
      parts.push('successful execution');
    }

    parts.push(`Reason: ${example.finishedReason}`);

    return parts.join(' | ');
  }

  getExampleById(id: string): FewShotExample | undefined {
    return this.examples.get(id);
  }

  getExamplesBySkill(skillName: string): FewShotExample[] {
    return Array.from(this.examples.values()).filter((ex) => ex.skillName === skillName);
  }

  removeExample(id: string): boolean {
    return this.examples.delete(id);
  }

  async buildFewShotPrompt(
    query: string,
    skillName: string,
    options: { maxExamples?: number; includeFailures?: boolean } = {}
  ): Promise<string> {
    const maxExamples = options.maxExamples || 3;
    const includeFailures = options.includeFailures ?? false;

    const candidates = await this.mine(query, {
      skillName,
      successOnly: !includeFailures,
      limit: maxExamples * 2,
    });

    const selected = candidates.slice(0, maxExamples);

    if (selected.length === 0) {
      return '';
    }

    const sections = ['# Few-Shot Examples\n'];

    for (const candidate of selected) {
      const ex = candidate.example;
      sections.push(`## Example: ${ex.taskInstruction}\n`);
      sections.push(`**Skill**: ${ex.skillName} | **Result**: ${ex.success ? 'SUCCESS' : 'FAILED'} (${ex.finishedReason})\n`);
      sections.push('```\n');

      for (const entry of ex.trace) {
        sections.push(`[${entry.iteration}] ${entry.thought?.slice(0, 200) || ''}\n`);
        if (entry.toolCall) {
          sections.push(`  Tool: ${entry.toolCall.name}(${JSON.stringify(entry.toolCall.args ?? {}).slice(0, 100)})\n`);
        }
        sections.push(`  -> ${entry.observation?.slice(0, 200) || ''}\n`);
      }

      sections.push('```\n');
    }

    return sections.join('\n');
  }
}
