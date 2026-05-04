import { useState, useEffect } from 'react';
import { BookOpen, Cpu, MessageSquare, Lock, ChevronRight, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';

import { listSkills, type SkillInfo, type SkillDetail } from '@/api/client';

export function SkillLibrary() {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<SkillDetail | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSkills();
  }, []);

  async function loadSkills() {
    setLoading(true);
    try {
      const data = await listSkills();
      setSkills(data);
    } catch (error) {
      console.error('Failed to load skills:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredSkills = skills.filter((skill) =>
    skill.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    skill.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex gap-6">
      <div className="flex-1">
        <div className="flex items-center justify-between mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="搜索技能..."
              className="pl-10 w-64"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6">
                  <div className="h-8 w-8 bg-muted rounded-lg mb-4" />
                  <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </CardContent>
              </Card>
            ))
          ) : filteredSkills.length === 0 ? (
            <div className="col-span-3 text-center py-12">
              <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">未找到匹配的技能</p>
            </div>
          ) : (
            filteredSkills.map((skill) => (
              <Dialog key={skill.name}>
                <DialogTrigger asChild>
                  <Card className="cursor-pointer hover:border-primary/50 transition-colors">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Cpu className="w-5 h-5 text-primary" />
                        </div>
                        {skill.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                        {skill.description}
                      </p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                            {skill.toolWhitelistCount}
                          </span>
                          <span className="flex items-center gap-1">
                            <MessageSquare className="w-3 h-3" />
                            {skill.fewShotCount}
                          </span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  {selectedSkill?.name === skill.name && (
                    <>
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Cpu className="w-5 h-5 text-primary" />
                          </div>
                          {selectedSkill.name}
                        </DialogTitle>
                        <DialogDescription>{selectedSkill.description}</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 mt-4">
                        <div className="grid grid-cols-3 gap-4">
                          <div className="p-4 bg-muted/50 rounded-lg">
                            <p className="text-xs text-muted-foreground mb-1">工具数量</p>
                            <p className="text-xl font-bold">{selectedSkill.toolWhitelistCount}</p>
                          </div>
                          <div className="p-4 bg-muted/50 rounded-lg">
                            <p className="text-xs text-muted-foreground mb-1">示例数量</p>
                            <p className="text-xl font-bold">{selectedSkill.fewShotCount}</p>
                          </div>
                          <div className="p-4 bg-muted/50 rounded-lg">
                            <p className="text-xs text-muted-foreground mb-1">最大迭代</p>
                            <p className="text-xl font-bold">{selectedSkill.maxLoopIterations}</p>
                          </div>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium mb-2">工具白名单</h4>
                          {selectedSkill.toolWhitelist && selectedSkill.toolWhitelist.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {selectedSkill.toolWhitelist.map((tool) => (
                                <Badge key={tool} variant="secondary">{tool}</Badge>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">无限制</p>
                          )}
                        </div>
                        <div>
                          <h4 className="text-sm font-medium mb-2">完成条件</h4>
                          <p className="text-sm text-muted-foreground">{selectedSkill.finishCriteria}</p>
                        </div>
                      </div>
                      <div className="flex justify-end mt-6">
                        <Button onClick={() => setSelectedSkill(null)}>关闭</Button>
                      </div>
                    </>
                  )}
                </DialogContent>
              </Dialog>
            ))
          )}
        </div>
      </div>

      <div className="w-80">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              技能统计
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <span className="text-sm text-muted-foreground">技能总数</span>
              <span className="text-xl font-bold">{skills.length}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <span className="text-sm text-muted-foreground">平均工具数</span>
              <span className="text-xl font-bold">
                {skills.length > 0 
                  ? Math.round(skills.reduce((acc, s) => acc + s.toolWhitelistCount, 0) / skills.length)
                  : 0
                }
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <span className="text-sm text-muted-foreground">平均示例数</span>
              <span className="text-xl font-bold">
                {skills.length > 0 
                  ? Math.round(skills.reduce((acc, s) => acc + s.fewShotCount, 0) / skills.length)
                  : 0
                }
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
