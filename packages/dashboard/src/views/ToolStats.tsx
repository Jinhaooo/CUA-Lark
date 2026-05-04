import { Gauge, Zap, Clock, AlertTriangle, BarChart2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ToolUsage {
  name: string;
  calls: number;
  avgTime: number;
  successRate: number;
  errors: number;
}

const mockTools: ToolUsage[] = [
  { name: 'click', calls: 1256, avgTime: 280, successRate: 99.2, errors: 10 },
  { name: 'type', calls: 892, avgTime: 150, successRate: 99.8, errors: 2 },
  { name: 'locate', calls: 2156, avgTime: 450, successRate: 98.5, errors: 32 },
  { name: 'scroll', calls: 543, avgTime: 320, successRate: 99.5, errors: 3 },
  { name: 'screenshot', calls: 189, avgTime: 850, successRate: 97.8, errors: 4 },
  { name: 'keyboard', calls: 324, avgTime: 180, successRate: 99.1, errors: 3 },
  { name: 'wait', calls: 876, avgTime: 2000, successRate: 100, errors: 0 },
  { name: 'ocr', calls: 156, avgTime: 1200, successRate: 96.8, errors: 5 },
];

interface PerformanceMetric {
  label: string;
  value: string;
  unit: string;
  status: 'good' | 'warning' | 'critical';
}

const performanceMetrics: PerformanceMetric[] = [
  { label: '平均响应时间', value: '450', unit: 'ms', status: 'good' },
  { label: '工具调用成功率', value: '98.7', unit: '%', status: 'good' },
  { label: '定位失败率', value: '1.3', unit: '%', status: 'warning' },
  { label: 'OCR 识别准确率', value: '96.8', unit: '%', status: 'good' },
];

export function ToolStats() {
  const totalCalls = mockTools.reduce((acc, t) => acc + t.calls, 0);
  const avgTime = Math.round(mockTools.reduce((acc, t) => acc + t.avgTime, 0) / mockTools.length);
  const totalErrors = mockTools.reduce((acc, t) => acc + t.errors, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-full">
                <Zap className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">总调用次数</p>
                <p className="text-xl font-bold">{totalCalls.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-full">
                <Clock className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">平均耗时</p>
                <p className="text-xl font-bold">{avgTime}ms</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-full">
                <Gauge className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">整体成功率</p>
                <p className="text-xl font-bold">98.7%</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-full">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">总错误数</p>
                <p className="text-xl font-bold">{totalErrors}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart2 className="w-5 h-5" />
                工具使用统计
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {mockTools.map((tool) => (
                  <div key={tool.name} className="flex items-center gap-4">
                    <div className="w-24">
                      <p className="font-medium text-sm">{tool.name}</p>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${(tool.calls / 2500) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-16 text-right">
                          {tool.calls.toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div className="w-20 text-right">
                      <span className="text-sm">{tool.avgTime}ms</span>
                    </div>
                    <div className="w-20">
                      <Badge variant={tool.successRate >= 99 ? 'secondary' : tool.successRate >= 97 ? 'default' : 'destructive'}>
                        {tool.successRate}%
                      </Badge>
                    </div>
                    <div className="w-12 text-right">
                      <span className="text-sm text-muted-foreground">{tool.errors}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>性能指标</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {performanceMetrics.map((metric) => (
                <div key={metric.label} className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">{metric.label}</span>
                    <Badge variant={
                      metric.status === 'good' ? 'secondary' : 
                      metric.status === 'warning' ? 'default' : 'destructive'
                    }>
                      {metric.status === 'good' ? '正常' : metric.status === 'warning' ? '警告' : '严重'}
                    </Badge>
                  </div>
                  <p className="text-2xl font-bold">
                    {metric.value}
                    <span className="text-sm font-normal text-muted-foreground ml-1">{metric.unit}</span>
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>调用分布</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {mockTools.slice(0, 5).map((tool) => {
                  const percentage = ((tool.calls / totalCalls) * 100).toFixed(1);
                  return (
                    <div key={tool.name}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span>{tool.name}</span>
                        <span className="text-muted-foreground">{percentage}%</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
