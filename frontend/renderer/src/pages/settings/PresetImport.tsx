import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@renderer/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import { Input } from '@renderer/components/ui/input';
import { Label } from '@renderer/components/ui/label';
import { Switch } from '@renderer/components/ui/switch';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@renderer/components/ui/tabs';
import { useSetting } from '@renderer/hooks/useSetting';

interface PresetImportProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PresetImport({ isOpen, onClose }: PresetImportProps) {
  const [remoteUrl, setRemoteUrl] = useState('');
  const [autoUpdate, setAutoUpdate] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { importPresetFromText, importPresetFromUrl } = useSetting();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      const yamlText = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
      });

      await importPresetFromText(yamlText);
      toast.success('预设已导入');
      onClose();
    } catch (error) {
      toast.error('导入预设失败', {
        description:
          error instanceof Error ? error.message : '发生未知错误',
      });
    }
  };

  const handleRemoteImport = async () => {
    try {
      await importPresetFromUrl(remoteUrl, autoUpdate);
      toast.success('预设已导入');
      onClose();
    } catch (error) {
      toast.error('导入预设失败', {
        description:
          error instanceof Error ? error.message : '发生未知错误',
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[400px]">
        <DialogHeader>
          <DialogTitle>导入预设</DialogTitle>
          <DialogDescription>
            导入模型配置预设文件。
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="local" className="w-full mb-6">
          <TabsList className="grid w-full grid-cols-2 mb-2">
            <TabsTrigger value="local">本地文件</TabsTrigger>
            <TabsTrigger value="remote">远程链接</TabsTrigger>
          </TabsList>

          <TabsContent value="local" className="space-y-4">
            <div className="flex flex-col items-center gap-4">
              <DialogDescription>
                选择一个 YAML 文件导入设置预设
              </DialogDescription>
              <input
                type="file"
                accept=".yaml,.yml"
                ref={fileInputRef}
                className="hidden"
                onChange={handleFileChange}
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                选择文件
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="remote" className="space-y-4">
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="preset-url">预设链接</Label>
                <Input
                  id="preset-url"
                  value={remoteUrl}
                  onChange={(e) => setRemoteUrl(e.target.value)}
                  placeholder="https://example.com/preset.yaml"
                />
              </div>
              <div className="flex items-center space-x-2">
                <Label htmlFor="auto-update">启动时自动更新</Label>
                <Switch
                  id="auto-update"
                  checked={autoUpdate}
                  onCheckedChange={setAutoUpdate}
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex flex-row items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleRemoteImport} disabled={!remoteUrl}>
            导入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
