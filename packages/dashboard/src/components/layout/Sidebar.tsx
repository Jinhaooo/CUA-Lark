import { 
  Activity, 
  ListTodo, 
  FileText, 
  Library, 
  BarChart3, 
  Gauge,
  Settings
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
}

const menuItems = [
  { id: 'live', label: '实时视图', icon: Activity },
  { id: 'tasks', label: '任务列表', icon: ListTodo },
  { id: 'detail', label: '任务详情', icon: FileText },
  { id: 'skills', label: '技能库', icon: Library },
  { id: 'benchmark', label: '基准测试', icon: BarChart3 },
  { id: 'stats', label: '工具统计', icon: Gauge },
];

export function Sidebar({ currentView, onViewChange }: SidebarProps) {
  return (
    <aside className="w-64 border-r bg-background h-screen flex flex-col">
      <div className="p-4 border-b">
        <h1 className="text-xl font-bold text-foreground">CUA-Lark</h1>
        <p className="text-sm text-muted-foreground">智能任务执行平台</p>
      </div>
      
      <nav className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors',
                isActive 
                  ? 'bg-primary text-primary-foreground' 
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>
      
      <div className="p-4 border-t">
        <button className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors">
          <Settings className="w-5 h-5" />
          <span className="font-medium">设置</span>
        </button>
      </div>
    </aside>
  );
}
