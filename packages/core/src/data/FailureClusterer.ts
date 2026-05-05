import type { HarnessTrace } from '../harness/types.js';
import type { EmbeddingClient } from './EmbeddingClient.js';

export type FailureKind =
  | 'locator_failed'
  | 'verification_failed'
  | 'unexpected_ui'
  | 'permission_denied'
  | 'network_error'
  | 'timeout'
  | 'assertion_failed'
  | 'unknown';

export interface FailureRecord {
  id: string;
  taskId: string;
  skillName: string;
  reason: string;
  errorKind: FailureKind;
  trace: HarnessTrace[];
  screenshotBase64?: string;
  rootCause?: string;
  suggestedFix?: string;
  timestamp: Date;
  resolved: boolean;
  resolution?: string;
}

export interface FailureCluster {
  id: string;
  kind: FailureKind;
  pattern: string;
  count: number;
  records: FailureRecord[];
  sharedRootCause: string;
  suggestedFix: string;
  avgTokens?: number;
  avgDurationMs?: number;
}

export interface ClusteringOptions {
  minClusterSize?: number;
  similarityThreshold?: number;
  timeWindowDays?: number;
}

export class FailureClusterer {
  private embeddingClient: EmbeddingClient;
  private failures: Map<string, FailureRecord>;
  private clusters: Map<string, FailureCluster>;

  constructor(embeddingClient: EmbeddingClient) {
    this.embeddingClient = embeddingClient;
    this.failures = new Map();
    this.clusters = new Map();
  }

  async addFailure(failure: Omit<FailureRecord, 'id'>): Promise<FailureRecord> {
    const id = `failure_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const fullFailure: FailureRecord = {
      ...failure,
      id,
    };

    this.failures.set(id, fullFailure);
    return fullFailure;
  }

  async cluster(options: ClusteringOptions = {}): Promise<FailureCluster[]> {
    const minClusterSize = options.minClusterSize || 2;
    const similarityThreshold = options.similarityThreshold || 0.85;

    const failedTraces = Array.from(this.failures.values()).filter(
      (f) => !f.resolved
    );

    if (failedTraces.length === 0) {
      return [];
    }

    const embeddings = await Promise.all(
      failedTraces.map((f) => this.embeddingClient.embed(this.buildFailureText(f)))
    );

    const clusters: FailureCluster[] = [];
    const assigned = new Set<string>();

    for (let i = 0; i < failedTraces.length; i++) {
      const baseFailure = failedTraces[i];
      const baseEmbedding = embeddings[i];
      if (!baseFailure || !baseEmbedding || assigned.has(baseFailure.id)) {
        continue;
      }

      const clusterRecords: FailureRecord[] = [baseFailure];
      assigned.add(baseFailure.id);

      for (let j = i + 1; j < failedTraces.length; j++) {
        const candidateFailure = failedTraces[j];
        const candidateEmbedding = embeddings[j];
        if (!candidateFailure || !candidateEmbedding || assigned.has(candidateFailure.id)) {
          continue;
        }

        const similarity = this.embeddingClient.cosineSimilarity(
          baseEmbedding.embedding,
          candidateEmbedding.embedding
        );

        if (similarity >= similarityThreshold) {
          clusterRecords.push(candidateFailure);
          assigned.add(candidateFailure.id);
        }
      }

      if (clusterRecords.length >= minClusterSize) {
        const cluster = this.buildCluster(clusterRecords);
        clusters.push(cluster);
        this.clusters.set(cluster.id, cluster);
      }
    }

    return clusters;
  }

  private buildFailureText(failure: FailureRecord): string {
    const traceSummary = failure.trace
      .slice(-3)
      .map((t) => `${t.toolCall?.name || '?'}: ${t.observation || ''}`)
      .join(' | ');

    return `${failure.reason} | ${failure.errorKind} | ${traceSummary}`;
  }

  private buildCluster(records: FailureRecord[]): FailureCluster {
    const kind = this.aggregateErrorKind(records);
    const pattern = this.aggregatePattern(records);
    const { rootCause, suggestedFix } = this.aggregateRootCause(records);

    const totalTokens = records.reduce(
      (sum, r) => sum + r.trace.reduce((s, t) => s + (t.cost?.tokens || 0), 0),
      0
    );

    const totalDurationMs = records.reduce(
      (sum, r) => sum + r.trace.reduce((s, t) => s + (t.durationMs || 0), 0),
      0
    );

    return {
      id: `cluster_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      kind,
      pattern,
      count: records.length,
      records,
      sharedRootCause: rootCause,
      suggestedFix,
      avgTokens: records.length > 0 ? totalTokens / records.length : 0,
      avgDurationMs: records.length > 0 ? totalDurationMs / records.length : 0,
    };
  }

  private aggregateErrorKind(records: FailureRecord[]): FailureKind {
    const kindCounts = new Map<FailureKind, number>();

    for (const record of records) {
      const count = kindCounts.get(record.errorKind) || 0;
      kindCounts.set(record.errorKind, count + 1);
    }

    let maxCount = 0;
    let dominantKind: FailureKind = 'unknown';

    for (const [kind, count] of kindCounts) {
      if (count > maxCount) {
        maxCount = count;
        dominantKind = kind;
      }
    }

    return dominantKind;
  }

  private aggregatePattern(records: FailureRecord[]): string {
    const toolFailures = new Map<string, number>();

    for (const record of records) {
      const lastTool = record.trace[record.trace.length - 1]?.toolCall?.name;
      if (lastTool) {
        const count = toolFailures.get(lastTool) || 0;
        toolFailures.set(lastTool, count + 1);
      }
    }

    let maxCount = 0;
    let pattern = 'Unknown pattern';

    for (const [tool, count] of toolFailures) {
      if (count > maxCount) {
        maxCount = count;
        pattern = `Tool "${tool}" failing`;
      }
    }

    return pattern;
  }

  private aggregateRootCause(
    records: FailureRecord[]
  ): { rootCause: string; suggestedFix: string } {
    const roots = records
      .filter((r) => r.rootCause)
      .map((r) => r.rootCause!);

    const fixes = records
      .filter((r) => r.suggestedFix)
      .map((r) => r.suggestedFix!);

    if (roots.length === 0) {
      return {
        rootCause: 'Unknown root cause - requires investigation',
        suggestedFix: 'Review trace and add root cause analysis',
      };
    }

    const rootCause = roots[0] ?? 'Unknown root cause - requires investigation';
    const suggestedFix = fixes[0] ?? 'No fix suggested';

    return { rootCause, suggestedFix };
  }

  getCluster(clusterId: string): FailureCluster | undefined {
    return this.clusters.get(clusterId);
  }

  getClustersByKind(kind: FailureKind): FailureCluster[] {
    return Array.from(this.clusters.values()).filter((c) => c.kind === kind);
  }

  getFailure(failureId: string): FailureRecord | undefined {
    return this.failures.get(failureId);
  }

  markResolved(failureId: string, resolution: string): boolean {
    const failure = this.failures.get(failureId);
    if (failure) {
      failure.resolved = true;
      failure.resolution = resolution;
      return true;
    }
    return false;
  }

  getUnresolvedFailures(): FailureRecord[] {
    return Array.from(this.failures.values()).filter((f) => !f.resolved);
  }

  getClusterStats(): {
    totalFailures: number;
    resolvedFailures: number;
    unresolvedFailures: number;
    clusterCount: number;
    kindDistribution: Record<FailureKind, number>;
  } {
    const all = Array.from(this.failures.values());
    const resolved = all.filter((f) => f.resolved);
    const unresolved = all.filter((f) => !f.resolved);

    const kindDistribution: Record<FailureKind, number> = {
      locator_failed: 0,
      verification_failed: 0,
      unexpected_ui: 0,
      permission_denied: 0,
      network_error: 0,
      timeout: 0,
      assertion_failed: 0,
      unknown: 0,
    };

    for (const f of unresolved) {
      kindDistribution[f.errorKind]++;
    }

    return {
      totalFailures: all.length,
      resolvedFailures: resolved.length,
      unresolvedFailures: unresolved.length,
      clusterCount: this.clusters.size,
      kindDistribution,
    };
  }
}
