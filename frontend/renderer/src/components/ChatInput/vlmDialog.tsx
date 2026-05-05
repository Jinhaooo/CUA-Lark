import { Button } from '@renderer/components/ui/button';

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';

interface VLMDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VLMDialog({ open, onOpenChange }: VLMDialogProps) {
  const handleConfigureClick = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>需要配置视觉大模型</DialogTitle>
          <DialogDescription className="text-foreground">
            当前缺少视觉大模型配置，运行需要这些参数。现在去配置吗？
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">取消</Button>
          </DialogClose>
          <Button type="button" onClick={handleConfigureClick}>
            去配置
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
