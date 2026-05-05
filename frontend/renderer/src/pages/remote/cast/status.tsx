import { memo } from 'react';
import { RemoteResourceStatus } from '@renderer/hooks/useRemoteResource';

interface StatusIndicatorProps {
  name: string;
  status: RemoteResourceStatus;
  queueNum?: number | null;
}

const statusConfig = {
  init: {
    icon: '🚀',
    title: '初始化中',
    description: '正在准备云端{name}连接...',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-600',
  },
  unavailable: {
    icon: '📁',
    title: '不可用',
    description: '该资源来自历史记录，当前已不可用',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-600',
  },
  queuing: {
    icon: '⏳',
    title: '排队中',
    description: '正在排队建立连接',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-600',
  },
  connecting: {
    icon: '🔄',
    title: '连接中',
    description: '正在建立云端{name}连接...',
    bgColor: 'bg-yellow-50',
    textColor: 'text-yellow-600',
  },
  connected: {
    icon: '✅',
    title: '已连接',
    description: '云端{name}连接已成功建立',
    bgColor: 'bg-green-50',
    textColor: 'text-green-600',
  },
  expired: {
    icon: '⏰',
    title: '会话已过期',
    description:
      '云端{name}会话已过期，请创建新的对话。',
    bgColor: 'bg-orange-50',
    textColor: 'text-orange-600',
  },
  error: {
    icon: '❌',
    title: '连接错误',
    description:
      '云端{name}连接建立失败，请重试。',
    bgColor: 'bg-red-50',
    textColor: 'text-red-600',
  },
} as const;

export const StatusIndicator = memo<StatusIndicatorProps>(
  ({ name, status, queueNum }) => {
    const config = statusConfig[status];

    const description = config.description.replace('{name}', name);

    const renderQueueInfo = () => {
      if (status === 'queuing' && queueNum !== null && queueNum !== undefined) {
        return (
          <div
            className={`mt-2 px-3 py-1 rounded-full text-xs font-medium ${config.textColor} bg-white/50`}
          >
            当前排队位置：#{queueNum}
          </div>
        );
      }
      return null;
    };

    const renderLoadingSpinner = () => {
      if (status === 'connecting' || status === 'queuing') {
        return (
          <div className="mt-4">
            <div
              className={`animate-spin rounded-full h-6 w-6 border-b-2 border-current ${config.textColor}`}
            />
          </div>
        );
      }
      return null;
    };

    return (
      <div
        className={`flex flex-col items-center justify-center w-full h-full ${config.bgColor} border-2 border-dashed border-gray-300 rounded-lg`}
      >
        <div className="text-4xl mb-4" role="img" aria-label={config.title}>
          {config.icon}
        </div>

        <h3 className={`text-xl font-semibold mb-2 ${config.textColor}`}>
          {config.title}
        </h3>

        <p className={`text-sm text-center ${config.textColor} opacity-80`}>
          {description}
        </p>

        {renderQueueInfo()}
        {renderLoadingSpinner()}
      </div>
    );
  },
);

StatusIndicator.displayName = 'StatusIndicator';
