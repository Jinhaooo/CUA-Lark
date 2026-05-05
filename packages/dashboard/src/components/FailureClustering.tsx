import { useState, useEffect } from 'react';
import { AlertTriangle, BarChart3, RefreshCw, CheckCircle, XCircle, Clock, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { apiClient } from '@/api/client';

interface FailureRecord {
  id: string;
  taskId: string;
  skillName: string;
  reason: string;
  errorKind: string;
  resolved: boolean;
  resolution?: string;
  timestamp: string;
}

interface FailureCluster {
  id: string;
  kind: string;
  pattern: string;
  count: number;
  sharedRootCause: string;
  suggestedFix: string;
  avgTokens?: number;
  avgDurationMs?: number;
  records: FailureRecord[];
}

interface ClusterStats {
  totalFailures: number;
  resolvedFailures: number;
  unresolvedFailures: number;
  clusterCount: number;
  kindDistribution: Record<string, number>;
}

export function FailureClustering() {
  const [failures, setFailures] = useState<FailureRecord[]>([]);
  const [clusters, setClusters] = useState<FailureCluster[]>([]);
  const [selectedCluster, setSelectedCluster] = useState<FailureCluster | null>(null);
  const [stats, setStats] = useState<ClusterStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadStats();
    loadFailures();
  }, []);

  const loadStats = async () => {
    try {
      const response = await apiClient.get('/curation/stats');
      setStats(response);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const loadFailures = async () => {
    try {
      const response = await apiClient.get('/curation/failures', {
        params: { resolved: false, limit: 100 },
      });
      setFailures(response.failures);
    } catch (error) {
      console.error('Failed to load failures:', error);
    }
  };

  const handleCluster = async () => {
    setIsLoading(true);
    try {
      const response = await apiClient.post('/curation/cluster', {
        minClusterSize: 2,
        similarityThreshold: 0.85,
      });
      setClusters(response.clusters);
    } catch (error) {
      console.error('Failed to cluster:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResolveFailure = async (failureId: string) => {
    try {
      await apiClient.post(`/curation/failures/${failureId}/resolve`, {
        resolution: 'Manually resolved via dashboard',
      });
      loadStats();
      loadFailures();
    } catch (error) {
      console.error('Failed to resolve:', error);
    }
  };

  const getKindColor = (kind: string) => {
    const colors: Record<string, string> = {
      locator_failed: 'text-orange-600 bg-orange-100',
      verification_failed: 'text-red-600 bg-red-100',
      unexpected_ui: 'text-purple-600 bg-purple-100',
      permission_denied: 'text-yellow-600 bg-yellow-100',
      network_error: 'text-blue-600 bg-blue-100',
      timeout: 'text-cyan-600 bg-cyan-100',
      assertion_failed: 'text-pink-600 bg-pink-100',
      unknown: 'text-gray-600 bg-gray-100',
    };
    return colors[kind] || colors.unknown;
  };

  const getKindLabel = (kind: string) => {
    const labels: Record<string, string> = {
      locator_failed: 'Locator Failed',
      verification_failed: 'Verification Failed',
      unexpected_ui: 'Unexpected UI',
      permission_denied: 'Permission Denied',
      network_error: 'Network Error',
      timeout: 'Timeout',
      assertion_failed: 'Assertion Failed',
      unknown: 'Unknown',
    };
    return labels[kind] || kind;
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats?.unresolvedFailures || 0}</p>
              <p className="text-sm text-muted-foreground">Unresolved Failures</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats?.resolvedFailures || 0}</p>
              <p className="text-sm text-muted-foreground">Resolved</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats?.clusterCount || 0}</p>
              <p className="text-sm text-muted-foreground">Active Clusters</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
              <Zap className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats?.totalFailures || 0}</p>
              <p className="text-sm text-muted-foreground">Total Failures</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-6 flex-1">
        <Card className="flex-1">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Failure Clusters
            </CardTitle>
            <Button onClick={handleCluster} disabled={isLoading} className="gap-2">
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              {isLoading ? 'Clustering...' : 'Run Clustering'}
            </Button>
          </CardHeader>
          <CardContent className="h-[400px]">
            <ScrollArea className="h-full">
              <div className="space-y-4">
                {clusters.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    {isLoading ? 'Analyzing failures...' : 'Click "Run Clustering" to group similar failures'}
                  </div>
                ) : (
                  clusters.map((cluster) => (
                    <div
                      key={cluster.id}
                      onClick={() => setSelectedCluster(cluster)}
                      className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                        selectedCluster?.id === cluster.id
                          ? 'border-primary bg-primary/10'
                          : 'border-input hover:border-primary/50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Badge className={getKindColor(cluster.kind)}>
                          {getKindLabel(cluster.kind)}
                        </Badge>
                        <Badge variant="secondary">{cluster.count} failures</Badge>
                      </div>
                      <p className="font-medium text-sm mb-1">{cluster.pattern}</p>
                      <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                        {cluster.sharedRootCause}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {cluster.avgTokens && (
                          <span className="flex items-center gap-1">
                            <Zap className="w-3 h-3" />
                            {cluster.avgTokens} tokens
                          </span>
                        )}
                        {cluster.avgDurationMs && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDuration(cluster.avgDurationMs)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="w-96">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {selectedCluster ? (
                <>
                  <BarChart3 className="w-5 h-5" />
                  Cluster Details
                </>
              ) : (
                <>
                  <XCircle className="w-5 h-5" />
                  Failures List
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[400px]">
            <ScrollArea className="h-full">
              {selectedCluster ? (
                <div className="space-y-4">
                  <div className="p-3 rounded-lg bg-muted">
                    <p className="text-xs font-medium mb-1">Root Cause</p>
                    <p className="text-sm">{selectedCluster.sharedRootCause}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-green-50">
                    <p className="text-xs font-medium mb-1">Suggested Fix</p>
                    <p className="text-sm text-green-700">{selectedCluster.suggestedFix}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium mb-2">Related Failures ({selectedCluster.records.length})</p>
                    <div className="space-y-2">
                      {selectedCluster.records.map((record) => (
                        <div key={record.id} className="p-2 rounded border text-xs">
                          <div className="flex justify-between items-center">
                            <span className="font-medium truncate">{record.taskId}</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleResolveFailure(record.id)}
                            >
                              <CheckCircle className="w-3 h-3" />
                            </Button>
                          </div>
                          <p className="text-muted-foreground mt-1 truncate">{record.reason}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {failures.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">
                      No unresolved failures
                    </div>
                  ) : (
                    failures.map((failure) => (
                      <div key={failure.id} className="p-3 rounded border text-xs">
                        <div className="flex items-center justify-between mb-1">
                          <Badge className={getKindColor(failure.errorKind)}>
                            {getKindLabel(failure.errorKind)}
                          </Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleResolveFailure(failure.id)}
                          >
                            <CheckCircle className="w-3 h-3" />
                          </Button>
                        </div>
                        <p className="font-medium truncate">{failure.skillName}</p>
                        <p className="text-muted-foreground mt-1 truncate">{failure.reason}</p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
