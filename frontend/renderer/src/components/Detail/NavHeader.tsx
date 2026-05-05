// /components/Header.tsx
import { Button } from '@renderer/components/ui/button';
import { ChevronLeft } from 'lucide-react';
interface HeaderProps {
  title?: string;
  onBack: () => void;
  children?: React.ReactNode;
}

export function NavHeader({ title, onBack, children }: HeaderProps) {
  return (
    <div className="pl-4 pr-5 py-3 flex items-center gap-2 draggable-area">
      <Button
        variant="ghost"
        size="sm"
        className="!pl-0"
        style={{ '-webkit-app-region': 'no-drag' }}
        onClick={onBack}
      >
        <ChevronLeft strokeWidth={2} className="!h-5 !w-5" />
        {title ? <span className="font-semibold">{title}</span> : null}
      </Button>

      <div className="flex-1 flex justify-end gap-2">{children}</div>
    </div>
  );
}
