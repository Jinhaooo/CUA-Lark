import { Operator } from '@main/store/types';

export interface RouterState {
  operator: Operator;
  sessionId: string;
  isFree?: boolean;
  from: 'home' | 'new' | 'history';
  initialInstruction?: string;
  autoRun?: boolean;
  autoSkillSummaryEnabled?: boolean;
}
