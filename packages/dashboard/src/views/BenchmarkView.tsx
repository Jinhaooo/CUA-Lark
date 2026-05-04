import { useState } from 'react';
import { BarChart3, TrendingUp, Target, Clock, CheckCircle, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface BenchmarkResult {
  id: string;
  name: string;
  score: number;
  avgTime: number;
  successRate: number;
  trend: 'up' | 'down' | 'stable';
  trendValue: number;
}

const mockBenchmarks: BenchmarkResult[] = [
  { id: '1', name: 'Lark IM 消息发送', score: 92, avgTime: 850, successRate: 98.5, trend: 'up', trendValue: 2.3 },
  { id: '2', name: 'Lark 日历创建', score: 88, avgTime: 1200, successRate: 96.2, trend: 'down', trendValue: 1.1 },
  { id: '3', name: 'Lark 文档编辑', score: 95, avgTime: 650, successRate: 99.1, trend: 'up', trendValue: 3.2 },
  { id: '4', name: 'Lark 会议预约', score: 85, avgTime: 1500, successRate: 94.8, trend: 'stable', trendValue: 0 },
];

interface HistoryRecord {
  date: string;
  avgScore: number;
  avgTime: number;
}

const mockHistory: HistoryRecord[] = [
  { date: '05-01', avgScore: 88, avgTime: 1100 },
  { date: '05-02', avgScore: 89, avgTime: 1050 },
  { date: '05-03', avgScore: 91, avgTime: 980 },
  { date: '05-04', avgScore: 90, avgTime: 1020 },
  { date: '05-05', avgScore: 92, avgTime: 950 },
  { date: '05-06', avgScore: 93, avgTime: 920 },
  { date: '05-07', avgScore: 91, avgTime: 980 },
];

export function BenchmarkView() {
  const [activeTab, setActiveTab] = useState('results');

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">平均分数</p>
                <p className="text-2xl font-bold mt-1">90.5</p>
              </div>
              <div className="p-2 bg-green-100 rounded-full">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
            </div>
            <p className="text-xs text-green-600 mt-2">+2.1% 较上周</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">平均耗时</p>
                <p className="text-2xl font-bold mt-1">990ms</p>
              </div>
              <div className="p-2 bg-blue-100 rounded-full">
                <Clock className="w-5 h-5 text-blue-600" />
              </div>
            </div>
            <p className="text-xs text-green-600 mt-2">-150ms 较上周</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">成功率</p>
                <p className="text-2xl font-bold mt-1">97.2%</p>
              </div>
              <div className="p-2 bg-emerald-100 rounded-full">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
            <p className="text-xs text-green-600 mt-2">+1.5% 较上周</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">测试用例</p>
                <p className="text-2xl font-bold mt-1">128</p>
              </div>
              <div className="p-2 bg-purple-100 rounded-full">
                <Target className="w-5 h-5 text-purple-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">4个新增</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="results">测试结果</TabsTrigger>
          <TabsTrigger value="history">历史趋势</TabsTrigger>
        </TabsList>

        <TabsContent value="results">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                基准测试结果
              </CardTitle>
              <CardDescription>各技能的性能和成功率统计</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mockBenchmarks.map((benchmark) => (
                  <div key={benchmark.id} className="flex items-center gap-6 p-4 bg-muted/50 rounded-lg">
                    <div className="w-32">
                      <p className="font-medium">{benchmark.name}</p>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${benchmark.score}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium w-12 text-right">{benchmark.score}</span>
                      </div>
                    </div>
                    <div className="w-24 text-center">
                      <p className="text-sm text-muted-foreground">耗时</p>
                      <p className="font-medium">{benchmark.avgTime}ms</p>
                    </div>
                    <div className="w-24 text-center">
                      <p className="text-sm text-muted-foreground">成功率</p>
                      <p className="font-medium">{benchmark.successRate}%</p>
                    </div>
                    <div className="w-20 flex items-center justify-center gap-1">
                      {benchmark.trend === 'up' && (
                        <>
                          <ArrowUpRight className="w-4 h-4 text-green-500" />
                          <span className="text-sm text-green-500">+{benchmark.trendValue}%</span>
                        </>
                      )}
                      {benchmark.trend === 'down' && (
                        <>
                          <ArrowDownRight className="w-4 h-4 text-red-500" />
                          <span className="text-sm text-red-500">-{benchmark.trendValue}%</span>
                        </>
                      )}
                      {benchmark.trend === 'stable' && (
                        <span className="text-sm text-muted-foreground">持平</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex justify-end">
                <Button>运行基准测试</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>历史趋势</CardTitle>
              <CardDescription>最近7天的平均分数和耗时变化</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div>
                  <h4 className="text-sm font-medium mb-4">平均分数趋势</h4>
                  <div className="flex items-end gap-4 h-40">
                    {mockHistory.map((record) => (
                      <div key={record.date} className="flex-1 flex flex-col items-center">
                        <div className="w-full bg-primary/20 rounded-t-lg transition-all hover:bg-primary/40" style={{ height: `${record.avgScore}%` }}>
                          <span className="text-xs text-center mt-1">{record.avgScore}</span>
                        </div>
                        <span className="text-xs text-muted-foreground mt-2">{record.date}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium mb-4">平均耗时趋势</h4>
                  <div className="flex items-end gap-4 h-40">
                    {mockHistory.map((record) => {
                      const height = Math.max(10, 100 - (record.avgTime / 15));
                      return (
                        <div key={record.date} className="flex-1 flex flex-col items-center">
                          <div className="w-full bg-blue-100 rounded-t-lg transition-all hover:bg-blue-200" style={{ height: `${height}%` }}>
                            <span className="text-xs text-center mt-1">{record.avgTime}</span>
                          </div>
                          <span className="text-xs text-muted-foreground mt-2">{record.date}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
