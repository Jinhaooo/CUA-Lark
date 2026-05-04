import { useState } from 'react';
import { Layout } from '@/components/layout/Layout';
import { LiveView } from '@/views/LiveView';
import { TaskList } from '@/views/TaskList';
import { TaskDetail } from '@/views/TaskDetail';
import { SkillLibrary } from '@/views/SkillLibrary';
import { BenchmarkView } from '@/views/BenchmarkView';
import { ToolStats } from '@/views/ToolStats';
import type { TaskSummary } from '@/api/client';

function App() {
  const [currentView, setCurrentView] = useState('live');
  const [selectedTask, setSelectedTask] = useState<TaskSummary | null>(null);

  function handleSelectTask(task: TaskSummary) {
    setSelectedTask(task);
    setCurrentView('detail');
  }

  function handleBackToList() {
    setSelectedTask(null);
    setCurrentView('tasks');
  }

  function handleViewChange(view: string) {
    setCurrentView(view);
    if (view !== 'detail') {
      setSelectedTask(null);
    }
  }

  const renderView = () => {
    switch (currentView) {
      case 'live':
        return <LiveView />;
      case 'tasks':
        return <TaskList onSelectTask={handleSelectTask} />;
      case 'detail':
        return <TaskDetail taskId={selectedTask?.id || null} onBack={handleBackToList} />;
      case 'skills':
        return <SkillLibrary />;
      case 'benchmark':
        return <BenchmarkView />;
      case 'stats':
        return <ToolStats />;
      default:
        return <LiveView />;
    }
  };

  return (
    <Layout 
      currentView={currentView} 
      onViewChange={handleViewChange}
      title={currentView === 'detail' ? selectedTask?.instruction || '任务详情' : ''}
    >
      {renderView()}
    </Layout>
  );
}

export default App;
