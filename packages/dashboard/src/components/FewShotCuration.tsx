import { useState } from 'react';
import { Search, Sparkles, BookOpen, TrendingUp, Filter } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { apiClient } from '@/api/client';

interface FewShotCandidate {
  id: string;
  skillName: string;
  taskInstruction: string;
  success: boolean;
  finishedReason: string;
  score: number;
  relevanceReason: string;
}

export function FewShotCuration() {
  const [query, setQuery] = useState('');
  const [skillName, setSkillName] = useState('');
  const [candidates, setCandidates] = useState<FewShotCandidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<FewShotCandidate | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [promptPreview, setPromptPreview] = useState('');

  const handleMine = async () => {
    if (!query || !skillName) return;

    setIsLoading(true);
    try {
      const response = await apiClient.post('/curation/few-shots/mine', {
        query,
        skillName,
        maxExamples: 5,
        includeFailures: false,
      });
      setCandidates(response.candidates);
    } catch (error) {
      console.error('Failed to mine few-shots:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBuildPrompt = async () => {
    if (!query || !skillName) return;

    try {
      const response = await apiClient.get('/curation/few-shots/build-prompt', {
        params: { query, skillName, maxExamples: 3 },
      });
      setPromptPreview(response.prompt);
    } catch (error) {
      console.error('Failed to build prompt:', error);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.9) return 'text-green-600 bg-green-100';
    if (score >= 0.7) return 'text-blue-600 bg-blue-100';
    if (score >= 0.5) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  return (
    <div className="h-full flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-500" />
            Few-Shot Curation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Search Query</label>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="What task are you looking for?"
                className="h-12"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Skill Name</label>
              <Input
                value={skillName}
                onChange={(e) => setSkillName(e.target.value)}
                placeholder="e.g., lark_im.send_message"
                className="h-12"
              />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <Button onClick={handleMine} className="flex-1" disabled={!query || !skillName || isLoading}>
              <Search className="w-4 h-4 mr-2" />
              {isLoading ? 'Mining...' : 'Mine Examples'}
            </Button>
            <Button variant="outline" onClick={handleBuildPrompt} disabled={!query || !skillName}>
              <BookOpen className="w-4 h-4 mr-2" />
              Build Prompt
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex-1 flex gap-6">
        <Card className="flex-1">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Matching Examples
              <Badge variant="secondary">{candidates.length}</Badge>
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setSelectedCandidate(null)}>
              <Filter className="w-4 h-4" />
              Reset
            </Button>
          </CardHeader>
          <CardContent className="h-[400px]">
            <ScrollArea className="h-full">
              <div className="space-y-3">
                {candidates.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    {isLoading ? 'Searching for examples...' : 'Enter a query and skill name to start mining'}
                  </div>
                ) : (
                  candidates.map((candidate) => (
                    <div
                      key={candidate.id}
                      onClick={() => setSelectedCandidate(candidate)}
                      className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                        selectedCandidate?.id === candidate.id
                          ? 'border-primary bg-primary/10'
                          : 'border-input hover:border-primary/50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline">{candidate.skillName}</Badge>
                        <Badge className={getScoreColor(candidate.score)}>
                          {Math.round(candidate.score * 100)}%
                        </Badge>
                      </div>
                      <p className="font-medium text-sm mb-1">{candidate.taskInstruction}</p>
                      <p className="text-xs text-muted-foreground mb-2">{candidate.relevanceReason}</p>
                      <div className="flex items-center gap-2">
                        <Badge variant={candidate.success ? 'default' : 'destructive'}>
                          {candidate.success ? 'SUCCESS' : 'FAILED'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{candidate.finishedReason}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {promptPreview && (
          <Card className="w-96">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                Generated Prompt
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[400px]">
              <ScrollArea className="h-full">
                <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">
                  {promptPreview}
                </pre>
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
