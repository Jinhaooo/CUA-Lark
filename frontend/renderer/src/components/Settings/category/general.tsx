import { useState } from 'react';
import { Button } from '@renderer/components/ui/button';
import { RefreshCcw } from 'lucide-react';
import { api } from '@/renderer/src/api';
import { toast } from 'sonner';

import { REPO_OWNER, REPO_NAME } from '@main/shared/constants';

export const GeneralSettings = () => {
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateDetail, setUpdateDetail] = useState<{
    currentVersion: string;
    version: string;
    link: string | null;
  } | null>();

  const handleCheckForUpdates = async () => {
    setUpdateLoading(true);
    try {
      const detail = await api.checkForUpdatesDetail();
      console.log('detail', detail);

      if (detail.updateInfo) {
        setUpdateDetail({
          currentVersion: detail.currentVersion,
          version: detail.updateInfo.version,
          link: `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/tag/v${detail.updateInfo.version}`,
        });
        return;
      } else if (!detail.isPackaged) {
        toast.info('开发版本不支持检查更新');
      } else {
        toast.success('当前已是最新版本', {
          description: `当前版本：${detail.currentVersion}`,
          position: 'top-right',
          richColors: true,
        });
      }
    } catch (error) {
      console.error('检查更新失败:', error);
    } finally {
      setUpdateLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        type="button"
        disabled={updateLoading}
        onClick={handleCheckForUpdates}
      >
        <RefreshCcw
          className={`h-4 w-4 mr-2 ${updateLoading ? 'animate-spin' : ''}`}
        />
        {updateLoading ? '检查中…' : '检查更新'}
      </Button>
      {updateDetail?.version && (
        <div className="text-sm text-gray-500">
          {`${updateDetail.currentVersion} → ${updateDetail.version}（最新）`}
        </div>
      )}
      {updateDetail?.link && (
        <div className="text-sm text-gray-500">
          更新说明：{' '}
          <a
            href={updateDetail.link}
            target="_blank"
            className="underline"
            rel="noreferrer"
          >
            {updateDetail.link}
          </a>
        </div>
      )}
    </>
  );
};
