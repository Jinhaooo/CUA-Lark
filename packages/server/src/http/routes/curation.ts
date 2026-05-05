import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { EmbeddingClient } from '@cua-lark/core/src/data/EmbeddingClient.js';
import type { FewShotMiner } from '@cua-lark/core/src/data/FewShotMiner.js';
import type { FailureClusterer, FailureRecord, FailureKind, FailureCluster } from '@cua-lark/core/src/data/FailureClusterer.js';

const AddFailureRequestSchema = z.object({
  taskId: z.string(),
  skillName: z.string(),
  reason: z.string(),
  errorKind: z.enum([
    'locator_failed',
    'verification_failed',
    'unexpected_ui',
    'permission_denied',
    'network_error',
    'timeout',
    'assertion_failed',
    'unknown',
  ]),
  trace: z.array(z.object({
    iteration: z.number(),
    thought: z.string().optional(),
    toolCall: z.object({
      name: z.string(),
      args: z.record(z.unknown()).optional(),
    }).optional(),
    observation: z.string().optional(),
    durationMs: z.number().optional(),
  })),
  screenshotBase64: z.string().optional(),
  rootCause: z.string().optional(),
  suggestedFix: z.string().optional(),
});

const ResolveFailureRequestSchema = z.object({
  resolution: z.string(),
});

const MineFewShotsRequestSchema = z.object({
  query: z.string(),
  skillName: z.string(),
  maxExamples: z.number().min(1).max(10).optional().default(3),
  includeFailures: z.boolean().optional().default(false),
});

export async function registerSkillCurationRoutes(
  server: FastifyInstance,
  dependencies: {
    embeddingClient: EmbeddingClient;
    fewShotMiner: FewShotMiner;
    failureClusterer: FailureClusterer;
  }
) {
  const { embeddingClient, fewShotMiner, failureClusterer } = dependencies;

  server.get('/curation/failures', {
    schema: {
      querystring: z.object({
        resolved: z.boolean().optional(),
        kind: z.string().optional(),
        limit: z.number().min(1).max(100).optional().default(50),
      }),
      response: {
        200: z.object({
          failures: z.array(z.object({
            id: z.string(),
            taskId: z.string(),
            skillName: z.string(),
            reason: z.string(),
            errorKind: z.string(),
            resolved: z.boolean(),
            resolution: z.string().optional(),
            timestamp: z.string(),
          })),
          total: z.number(),
        }),
      },
    },
  }, async (req, reply) => {
    const { resolved, kind, limit } = req.query as {
      resolved?: boolean;
      kind?: string;
      limit?: number;
    };

    let failures = Array.from(
      ((failureClusterer as any).failures as Map<string, FailureRecord> | undefined)?.values() || []
    );

    if (resolved !== undefined) {
      failures = failures.filter((f: FailureRecord) => f.resolved === resolved);
    }

    if (kind) {
      failures = failures.filter((f: FailureRecord) => f.errorKind === kind);
    }

    failures = failures.slice(0, limit || 50);

    return {
      failures: failures.map((f: FailureRecord) => ({
        id: f.id,
        taskId: f.taskId,
        skillName: f.skillName,
        reason: f.reason,
        errorKind: f.errorKind,
        resolved: f.resolved,
        resolution: f.resolution,
        timestamp: f.timestamp.toISOString(),
      })),
      total: failures.length,
    };
  });

  server.post('/curation/failures', {
    schema: {
      body: AddFailureRequestSchema,
      response: {
        201: z.object({
          id: z.string(),
          message: z.string(),
        }),
      },
    },
  }, async (req, reply) => {
    const data = AddFailureRequestSchema.parse(req.body);

    const failure = await failureClusterer.addFailure({
      taskId: data.taskId,
      skillName: data.skillName,
      reason: data.reason,
      errorKind: data.errorKind as FailureKind,
      trace: data.trace as any,
      screenshotBase64: data.screenshotBase64,
      rootCause: data.rootCause,
      suggestedFix: data.suggestedFix,
      timestamp: new Date(),
      resolved: false,
    });

    return reply.status(201).send({
      id: failure.id,
      message: 'Failure recorded successfully',
    });
  });

  server.post('/curation/failures/:id/resolve', {
    schema: {
      params: z.object({
        id: z.string(),
      }),
      body: ResolveFailureRequestSchema,
      response: {
        200: z.object({
          success: z.boolean(),
          message: z.string(),
        }),
        404: z.object({
          success: z.boolean(),
          message: z.string(),
        }),
      },
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { resolution } = ResolveFailureRequestSchema.parse(req.body);

    const success = failureClusterer.markResolved(id, resolution);

    if (!success) {
      return reply.status(404).send({
        success: false,
        message: `Failure ${id} not found`,
      });
    }

    return {
      success: true,
      message: `Failure ${id} marked as resolved`,
    };
  });

  server.post('/curation/cluster', {
    schema: {
      body: z.object({
        minClusterSize: z.number().min(1).max(10).optional().default(2),
        similarityThreshold: z.number().min(0).max(1).optional().default(0.85),
      }),
      response: {
        200: z.object({
          clusters: z.array(z.object({
            id: z.string(),
            kind: z.string(),
            pattern: z.string(),
            count: z.number(),
            sharedRootCause: z.string(),
            suggestedFix: z.string(),
            avgTokens: z.number().optional(),
            avgDurationMs: z.number().optional(),
          })),
          totalClusters: z.number(),
        }),
      },
    },
  }, async (req, reply) => {
    const { minClusterSize, similarityThreshold } = req.body as {
      minClusterSize?: number;
      similarityThreshold?: number;
    };

    const clusters = await failureClusterer.cluster({
      minClusterSize,
      similarityThreshold,
    });

    return {
      clusters: clusters.map((c: FailureCluster) => ({
        id: c.id,
        kind: c.kind,
        pattern: c.pattern,
        count: c.count,
        sharedRootCause: c.sharedRootCause,
        suggestedFix: c.suggestedFix,
        avgTokens: c.avgTokens,
        avgDurationMs: c.avgDurationMs,
      })),
      totalClusters: clusters.length,
    };
  });

  server.get('/curation/cluster/:id', {
    schema: {
      params: z.object({
        id: z.string(),
      }),
      response: {
        200: z.object({
          cluster: z.object({
            id: z.string(),
            kind: z.string(),
            pattern: z.string(),
            count: z.number(),
            sharedRootCause: z.string(),
            suggestedFix: z.string(),
            records: z.array(z.object({
              id: z.string(),
              taskId: z.string(),
              reason: z.string(),
              timestamp: z.string(),
            })),
          }),
        }),
        404: z.object({
          error: z.string(),
          message: z.string(),
        }),
      },
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const cluster = failureClusterer.getCluster(id);

    if (!cluster) {
      return reply.status(404).send({
        error: 'NotFound',
        message: `Cluster ${id} not found`,
      });
    }

    return {
      cluster: {
        id: cluster.id,
        kind: cluster.kind,
        pattern: cluster.pattern,
        count: cluster.count,
        sharedRootCause: cluster.sharedRootCause,
        suggestedFix: cluster.suggestedFix,
        records: cluster.records.map((r: FailureRecord) => ({
          id: r.id,
          taskId: r.taskId,
          reason: r.reason,
          timestamp: r.timestamp.toISOString(),
        })),
      },
    };
  });

  server.get('/curation/stats', {
    schema: {
      response: {
        200: z.object({
          totalFailures: z.number(),
          resolvedFailures: z.number(),
          unresolvedFailures: z.number(),
          clusterCount: z.number(),
          kindDistribution: z.record(z.string(), z.number()),
        }),
      },
    },
  }, async () => {
    const stats = failureClusterer.getClusterStats();
    return stats;
  });

  server.post('/curation/few-shots/mine', {
    schema: {
      body: MineFewShotsRequestSchema,
      response: {
        200: z.object({
          candidates: z.array(z.object({
            id: z.string(),
            skillName: z.string(),
            taskInstruction: z.string(),
            success: z.boolean(),
            finishedReason: z.string(),
            score: z.number(),
            relevanceReason: z.string(),
          })),
          total: z.number(),
        }),
      },
    },
  }, async (req, reply) => {
    const { query, skillName, maxExamples, includeFailures } = MineFewShotsRequestSchema.parse(req.body);

    const candidates = await fewShotMiner.mine(query, {
      skillName,
      successOnly: !includeFailures,
      limit: maxExamples,
    });

    return {
      candidates: candidates.map((c: { example: { id: string; skillName: string; taskInstruction: string; success: boolean; finishedReason: string }; score: number; relevanceReason: string }) => ({
        id: c.example.id,
        skillName: c.example.skillName,
        taskInstruction: c.example.taskInstruction,
        success: c.example.success,
        finishedReason: c.example.finishedReason,
        score: c.score,
        relevanceReason: c.relevanceReason,
      })),
      total: candidates.length,
    };
  });

  server.get('/curation/few-shots/build-prompt', {
    schema: {
      querystring: z.object({
        query: z.string(),
        skillName: z.string(),
        maxExamples: z.number().min(1).max(10).optional().default(3),
        includeFailures: z.boolean().optional().default(false),
      }),
      response: {
        200: z.object({
          prompt: z.string(),
        }),
      },
    },
  }, async (req, reply) => {
    const { query, skillName, maxExamples, includeFailures } = req.query as {
      query: string;
      skillName: string;
      maxExamples?: number;
      includeFailures?: boolean;
    };

    const prompt = await fewShotMiner.buildFewShotPrompt(query, skillName, {
      maxExamples,
      includeFailures,
    });

    return { prompt };
  });
}
