import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

interface LayoutProps {
  children: ReactNode;
  currentView: string;
  onViewChange: (view: string) => void;
  title: string;
}

const viewTitles: Record<string, string> = {
  live: '实时视图',
  tasks: '任务列表',
  detail: '任务详情',
  skills: '技能库',
  benchmark: '基准测试',
  stats: '工具统计',
};

export function Layout({ children, currentView, onViewChange, title }: LayoutProps) {
  return (
    <div className="flex h-screen bg-background">
      <Sidebar currentView={currentView} onViewChange={onViewChange} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title={title || viewTitles[currentView] || '实时视图'} />
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
