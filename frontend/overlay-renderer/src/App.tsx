import { ExecutionBorder } from './components/ExecutionBorder';
import { ActionHighlight } from './components/ActionHighlight';
import { ThoughtCard } from './components/ThoughtCard';
import { PauseButton } from './components/PauseButton';
import './index.css';

function App() {
  return (
    <div className="w-full h-full bg-transparent">
      <ExecutionBorder />
      <ActionHighlight />
      <ThoughtCard />
      <PauseButton />
    </div>
  );
}

export default App;