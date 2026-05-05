/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
// /apps/ui-tars/src/renderer/src/pages/settings/index.tsx
import { RefreshCcw, Trash } from 'lucide-react';
import { useRef, useEffect, useState } from 'react';
import * as z from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { api } from '@renderer/api';
import { SearchEngineForSettings, VLMProviderV2 } from '@main/store/types';
import { useSetting } from '@renderer/hooks/useSetting';
import { Button } from '@renderer/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@renderer/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { ScrollArea } from '@renderer/components/ui/scroll-area';
import { Input } from '@renderer/components/ui/input';
import { DragArea } from '@renderer/components/Common/drag';
import { BROWSER_OPERATOR } from '@renderer/const';

import { PresetImport } from './PresetImport';
import { Tabs, TabsList, TabsTrigger } from '@renderer/components/ui/tabs';
import { PresetBanner } from './PresetBanner';

import googleIcon from '@resources/icons/google-color.svg?url';
import bingIcon from '@resources/icons/bing-color.svg?url';
import baiduIcon from '@resources/icons/baidu-color.svg?url';
import { REPO_OWNER, REPO_NAME } from '@main/shared/constants';

// 定义表单验证 schema
const formSchema = z.object({
  language: z.enum(['en', 'zh']),
  vlmProvider: z.nativeEnum(VLMProviderV2, {
    message: '请选择一个视觉大模型服务商',
  }),
  vlmBaseUrl: z.string().url(),
  vlmApiKey: z.string().min(1),
  vlmModelName: z.string().min(1),
  maxLoopCount: z.number().min(25).max(200),
  loopIntervalInMs: z.number().min(0).max(3000),
  searchEngineForBrowser: z.nativeEnum(SearchEngineForSettings),
  reportStorageBaseUrl: z.string().optional(),
  utioBaseUrl: z.string().optional(),
});

const SECTIONS = {
  vlm: '视觉大模型',
  chat: '对话设置',
  report: '报告设置',
  general: '通用设置',
} as const;

export default function Settings() {
  const { settings, updateSetting, clearSetting, updatePresetFromRemote } =
    useSetting();
  const [isPresetModalOpen, setPresetModalOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('vlm');
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

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

  const isRemoteAutoUpdatedPreset =
    settings?.presetSource?.type === 'remote' &&
    settings.presetSource.autoUpdate;

  console.log('initialValues', settings);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      language: 'zh',
      vlmBaseUrl: '',
      vlmApiKey: '',
      vlmModelName: '',
      maxLoopCount: 100,
      loopIntervalInMs: 1000,
      reportStorageBaseUrl: '',
      searchEngineForBrowser: SearchEngineForSettings.GOOGLE,
      utioBaseUrl: '',
      ...settings,
    },
  });
  useEffect(() => {
    if (Object.keys(settings)) {
      form.reset({
        language: settings.language,
        vlmProvider: settings.vlmProvider,
        vlmBaseUrl: settings.vlmBaseUrl,
        vlmApiKey: settings.vlmApiKey,
        vlmModelName: settings.vlmModelName,
        maxLoopCount: settings.maxLoopCount,
        loopIntervalInMs: settings.loopIntervalInMs,
        searchEngineForBrowser: settings.searchEngineForBrowser,
        reportStorageBaseUrl: settings.reportStorageBaseUrl,
        utioBaseUrl: settings.utioBaseUrl,
      });
    }
  }, [settings, form]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { threshold: 0.5 },
    );

    Object.values(sectionRefs.current).forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => observer.disconnect();
  }, []);

  const scrollToSection = (section: string) => {
    sectionRefs.current[section]?.scrollIntoView({ behavior: 'smooth' });
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    console.log('onSubmit', values);

    updateSetting(values);
    // toast.success('Settings saved successfully');
    // await api.closeSettingsWindow();
    await api.showMainWindow();
  };

  const onCancel = async () => {
    // await api.closeSettingsWindow();
  };

  const handlePresetModal = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setPresetModalOpen(true);
  };

  const handleUpdatePreset = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      await updatePresetFromRemote();
      toast.success('预设更新成功');
    } catch (error) {
      toast.error('预设更新失败', {
        description:
          error instanceof Error ? error.message : '发生未知错误',
      });
    }
  };

  const handleResetPreset = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    await window.electron.setting.resetPreset();
    toast.success('已切换到手动配置模式', {
      duration: 1500,
    });
  };

  const handleClearSettings = async () => {
    try {
      await clearSetting();
      toast.success('已清空所有设置');
    } catch (error) {
      toast.error('清空设置失败', {
        description:
          error instanceof Error ? error.message : '发生未知错误',
      });
    }
  };

  return (
    <div className="h-screen flex flex-col bg-white">
      <DragArea />

      <div className="flex-1 flex gap-4 p-6 overflow-hidden">
        <Tabs
          orientation="vertical"
          value={activeSection}
          onValueChange={scrollToSection}
          className="w-34 shrink-0"
        >
          <TabsList className="flex flex-col h-auto bg-transparent p-0">
            {Object.entries(SECTIONS).map(([key, label]) => (
              <TabsTrigger
                key={key}
                value={key}
                className="justify-start w-full rounded-none border-0 border-l-4 data-[state=active]:shadow-none data-[state=active]:border-primary mb-1"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <ScrollArea className="flex-1">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <div
                id="vlm"
                ref={(el) => {
                  sectionRefs.current.vlm = el;
                }}
                className="space-y-6 ml-1 mr-4"
              >
                <h2 className="text-lg font-medium">{SECTIONS.vlm}</h2>
                {!isRemoteAutoUpdatedPreset && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handlePresetModal}
                  >
                    导入预设配置
                  </Button>
                )}
                {isRemoteAutoUpdatedPreset && (
                  <PresetBanner
                    url={settings.presetSource?.url}
                    date={settings.presetSource?.lastUpdated}
                    handleUpdatePreset={handleUpdatePreset}
                    handleResetPreset={handleResetPreset}
                  />
                )}
                {/* Model Settings Fields */}
                <FormField
                  control={form.control}
                  name="language"
                  render={({ field }) => {
                    return (
                      <FormItem>
                        <FormLabel>语言</FormLabel>
                        <Select
                          disabled={isRemoteAutoUpdatedPreset}
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="请选择语言" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="en">英文</SelectItem>
                            <SelectItem value="zh">中文</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    );
                  }}
                />
                {/* VLM Provider */}
                <FormField
                  control={form.control}
                  name="vlmProvider"
                  render={({ field }) => {
                    return (
                      <FormItem>
                        <FormLabel>视觉大模型服务商</FormLabel>
                        <Select
                          disabled={isRemoteAutoUpdatedPreset}
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="请选择服务商" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.values(VLMProviderV2).map((provider) => (
                              <SelectItem key={provider} value={provider}>
                                {provider}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
                {/* VLM Base URL */}
                <FormField
                  control={form.control}
                  name="vlmBaseUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>接口地址</FormLabel>
                      <FormControl>
                        <Input
                          disabled={isRemoteAutoUpdatedPreset}
                          placeholder="例如：https://bailian.aliyuncs.com/v1"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {/* VLM API Key */}
                <FormField
                  control={form.control}
                  name="vlmApiKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>API 密钥</FormLabel>
                      <FormControl>
                        <Input
                          disabled={isRemoteAutoUpdatedPreset}
                          placeholder="请输入 API 密钥"
                          {...field}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                {/* VLM Model Name */}
                <FormField
                  control={form.control}
                  name="vlmModelName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>模型名称</FormLabel>
                      <FormControl>
                        <Input
                          disabled={isRemoteAutoUpdatedPreset}
                          placeholder="例如：qwen3.6-plus"
                          {...field}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              {/* Chat Settings */}
              <div
                id="chat"
                ref={(el) => {
                  sectionRefs.current.chat = el;
                }}
                className="space-y-6 pt-6 ml-1 mr-4"
              >
                <h2 className="text-lg font-medium">{SECTIONS.chat}</h2>
                <FormField
                  control={form.control}
                  name="maxLoopCount"
                  render={({ field }) => {
                    // console.log('field', field);
                    return (
                      <FormItem>
                        <FormLabel>最大循环次数</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            // disabled={isRemoteAutoUpdatedPreset}
                            placeholder="请输入 25-200 之间的数字"
                            {...field}
                            value={field.value === 0 ? '' : field.value}
                            onChange={(e) =>
                              field.onChange(Number(e.target.value))
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
                <FormField
                  control={form.control}
                  name="loopIntervalInMs"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>循环等待时间（毫秒）</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          // disabled={isRemoteAutoUpdatedPreset}
                          placeholder="请输入 0-3000 之间的数字"
                          {...field}
                          value={field.value === 0 ? '' : field.value}
                          onChange={(e) =>
                            field.onChange(Number(e.target.value))
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="searchEngineForBrowser"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {BROWSER_OPERATOR} 的默认搜索引擎：
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className="w-[124px]">
                            <SelectValue placeholder="选择搜索引擎" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={SearchEngineForSettings.GOOGLE}>
                            <div className="flex items-center gap-2">
                              <img
                                src={googleIcon}
                                alt="Google"
                                className="w-4 h-4"
                              />
                              <span>Google</span>
                            </div>
                          </SelectItem>
                          <SelectItem value={SearchEngineForSettings.BING}>
                            <div className="flex items-center gap-2">
                              <img
                                src={bingIcon}
                                alt="Bing"
                                className="w-4 h-4"
                              />
                              <span>Bing</span>
                            </div>
                          </SelectItem>
                          <SelectItem value={SearchEngineForSettings.BAIDU}>
                            <div className="flex items-center gap-2">
                              <img
                                src={baiduIcon}
                                alt="Baidu"
                                className="w-4 h-4"
                              />
                              <span>Baidu</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div
                id="report"
                ref={(el) => {
                  sectionRefs.current.report = el;
                }}
                className="space-y-6 pt-6 ml-1 mr-4"
              >
                <h2 className="text-lg font-medium">{SECTIONS.report}</h2>
                {/* Report Settings Fields */}
                <FormField
                  control={form.control}
                  name="reportStorageBaseUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>报告存储服务接口地址</FormLabel>
                      <FormControl>
                        <Input
                          disabled={isRemoteAutoUpdatedPreset}
                          placeholder="例如：https://your-report-storage-endpoint.com/upload"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {/* UTIO Base URL */}
                <FormField
                  control={form.control}
                  name="utioBaseUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>UTIO 上报接口地址</FormLabel>
                      <FormControl>
                        <Input
                          disabled={isRemoteAutoUpdatedPreset}
                          placeholder="例如：https://your-utio-endpoint.com/collect"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="h-50"></div>
              </div>

              <div
                id="general"
                ref={(el) => {
                  sectionRefs.current.general = el;
                }}
                className="space-y-6 ml-1 mr-4"
              >
                <h2 className="text-lg font-medium">{SECTIONS.general}</h2>
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
                <div className="h-50" />
              </div>
            </form>
          </Form>
        </ScrollArea>
      </div>

      <div className="border-t p-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex justify-between items-center">
          <Button
            variant="outline"
            type="button"
            className="text-red-400 border-red-400 hover:bg-red-50 hover:text-red-500"
            onClick={handleClearSettings}
          >
            <Trash className="h-4 w-4" />
            清空
          </Button>
          <div className="flex gap-4">
            <Button variant="outline" type="button" onClick={onCancel}>
              取消
            </Button>
            <Button type="submit" onClick={form.handleSubmit(onSubmit)}>
              保存
            </Button>
          </div>
        </div>
      </div>

      <PresetImport
        isOpen={isPresetModalOpen}
        onClose={() => setPresetModalOpen(false)}
      />
    </div>
  );
}

export { Settings as Component };
