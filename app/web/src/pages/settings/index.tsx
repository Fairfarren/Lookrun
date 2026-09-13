import { ModelSettingsEditor } from './model-settings';
import { CheckCircle2, FlaskConical, Plus, Trash2, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { SystemInfo } from '@lookrun/shared';
import { BusyButton } from '../../components/busy-button';
import { confirmAction } from '../../components/confirm';
import { CopyText } from '../../components/copy-text';
import { notify } from '../../components/notify';
import { PageCard } from '../../components/page-card';
import { SelectField } from '../../components/select-field';
import { Alert, AlertTitle } from '../../components/ui/alert';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { LoadingBlock } from '../../components/loading-block';
import { errorText } from '../../utils/error-text';
import { defaultModelId } from '../../utils/default-model-id';
import { api, type ModelBrief, type StorageStats } from './api';
import { formatBytes } from './format-bytes';
import { modelCheckVariant } from '../../utils/ui-class';
import {
    checkResultFromError,
    emptyVariableName,
    emptyVariableRow,
    variablesFromRecord,
    variablesToRecord,
} from './utils';

interface VariableRow {
    key: string;
    value: string;
}

function CheckingHint({ checking }: { checking: boolean }) {
    if (!checking) {
        return null;
    }
    return (
        <div className='flex items-center gap-2 text-sm text-muted-foreground'>
            <LoadingBlock className='py-0' />
            正在向模型发送测试截图，验证能否返回元素坐标，可能需要几十秒...
        </div>
    );
}

function CheckResultIcon({ ok }: { ok: boolean }) {
    if (ok) {
        return <CheckCircle2 className='size-4' />;
    }
    return <XCircle className='size-4' />;
}

function CheckResultAlert({
    checkResult,
}: {
    checkResult: { ok: boolean; message: string } | null;
}) {
    if (!checkResult) {
        return null;
    }
    return (
        <Alert variant={modelCheckVariant(checkResult.ok)}>
            <AlertTitle className='flex items-center gap-2'>
                <CheckResultIcon ok={checkResult.ok} />
                {checkResult.message}
            </AlertTitle>
        </Alert>
    );
}

function EmptyVariablesHint({ count }: { count: number }) {
    if (count > 0) {
        return null;
    }
    return <p className='text-sm text-muted-foreground'>还没有变量</p>;
}

function StorageBody({ storage }: { storage: StorageStats | null }) {
    if (!storage) {
        return <LoadingBlock className='py-4' />;
    }
    return (
        <dl className='grid grid-cols-2 gap-x-6 gap-y-3 text-sm'>
            <div>
                <dt className='text-muted-foreground'>步骤截图</dt>
                <dd>{formatBytes(storage.screenshotsBytes)}</dd>
            </div>
            <div>
                <dt className='text-muted-foreground'>Midscene 报告</dt>
                <dd>{formatBytes(storage.reportsBytes)}</dd>
            </div>
            <div>
                <dt className='text-muted-foreground'>数据库</dt>
                <dd>{formatBytes(storage.databaseBytes)}</dd>
            </div>
            <div>
                <dt className='text-muted-foreground'>总计</dt>
                <dd>
                    <span className='font-medium'>{formatBytes(storage.totalBytes)}</span>
                    <span className='text-muted-foreground'> （{storage.runCount} 次运行）</span>
                </dd>
            </div>
        </dl>
    );
}

function DetectedPath({ path, missingTitle }: { path: string | null; missingTitle: string }) {
    if (!path) {
        return (
            <Alert variant='destructive'>
                <AlertTitle>{missingTitle}</AlertTitle>
            </Alert>
        );
    }
    return (
        <div className='flex flex-wrap items-center gap-2'>
            <Badge variant='success'>已检测到</Badge>
            <CopyText text={path} />
        </div>
    );
}

function SystemBody({ system }: { system: SystemInfo | null }) {
    if (!system) {
        return <LoadingBlock className='py-4' />;
    }
    return (
        <dl className='flex flex-col gap-4 text-sm'>
            <div>
                <dt className='mb-1 text-muted-foreground'>Chrome 浏览器</dt>
                <dd>
                    <DetectedPath
                        path={system.chromePath}
                        missingTitle='未检测到系统 Chrome，请先安装 Google Chrome：https://www.google.com/chrome/'
                    />
                </dd>
            </div>
            <div>
                <dt className='mb-1 text-muted-foreground'>Android ADB</dt>
                <dd>
                    <DetectedPath
                        path={system.adbPath}
                        missingTitle='未检测到 ADB，请使用包含 platform-tools 的完整程序包'
                    />
                </dd>
            </div>
            <div>
                <dt className='mb-1 text-muted-foreground'>数据目录</dt>
                <dd>{system.dataDir}</dd>
            </div>
            <div>
                <dt className='mb-1 text-muted-foreground'>版本</dt>
                <dd>{system.version}</dd>
            </div>
        </dl>
    );
}

export default function SettingsPage() {
    const [models, setModels] = useState<ModelBrief[]>([]);
    const [selectedModel, setSelectedModel] = useState<string>();
    const [checkResult, setCheckResult] = useState<{
        ok: boolean;
        message: string;
    } | null>(null);
    const [checking, setChecking] = useState(false);
    const [variables, setVariables] = useState<VariableRow[]>([]);
    const [system, setSystem] = useState<SystemInfo | null>(null);
    const [savingVariables, setSavingVariables] = useState(false);
    const [storage, setStorage] = useState<StorageStats | null>(null);
    const [cleaning, setCleaning] = useState(false);

    const loadStorage = () => {
        api.storageStats()
            .then(setStorage)
            .catch(() => {});
    };

    const refreshModels = () => {
        setCheckResult(null);
        api.listModels()
            .then((result) => {
                setModels(result.models);
                setSelectedModel(defaultModelId(result.selected, result.models[0]?.id));
            })
            .catch((error: Error) => notify.error(error.message));
    };

    useEffect(() => {
        refreshModels();
        api.getVariables()
            .then((vars) => setVariables(variablesFromRecord(vars)))
            .catch((error: Error) => notify.error(error.message));
        api.systemInfo()
            .then(setSystem)
            .catch(() => {});
        loadStorage();
    }, []);

    const runCleanup = async () => {
        try {
            const result = await api.cleanupStorage();
            notify.success(
                `已清空 ${result.deletedRuns} 次运行，释放 ${formatBytes(result.freedBytes)}`,
            );
            loadStorage();
        } catch (error) {
            notify.error(errorText(error));
        } finally {
            setCleaning(false);
        }
    };

    const confirmCleanup = async () => {
        const ok = await confirmAction({
            title: '清空全部历史记录？',
            description: '将删除所有运行记录、步骤日志和截图，任务与变量不受影响。此操作不可恢复。',
            confirmLabel: '全部清空',
            destructive: true,
        });
        if (!ok) {
            return;
        }
        setCleaning(true);
        await runCleanup();
    };

    const selectModel = async (id: string) => {
        setSelectedModel(id);
        setCheckResult(null);
        try {
            await api.selectModel(id);
            notify.success('默认模型已更新');
        } catch (error) {
            notify.error(errorText(error));
        }
    };

    const runModelCheck = async () => {
        try {
            setCheckResult(await api.checkModel(selectedModel!));
        } catch (error) {
            setCheckResult(checkResultFromError(error));
        } finally {
            setChecking(false);
        }
    };

    const checkModel = async () => {
        if (!selectedModel) {
            return;
        }
        setChecking(true);
        setCheckResult(null);
        await runModelCheck();
    };

    const persistVariables = async () => {
        try {
            await api.saveVariables(variablesToRecord(variables));
            notify.success('变量已保存');
        } catch (error) {
            notify.error(errorText(error));
        } finally {
            setSavingVariables(false);
        }
    };

    const saveVariables = async () => {
        if (emptyVariableName(variables)) {
            notify.warning('变量名不能为空');
            return;
        }
        setSavingVariables(true);
        await persistVariables();
    };

    const updateRow = (index: number, patch: Partial<VariableRow>) => {
        setVariables((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    };

    return (
        <div className='flex flex-col gap-4'>
            <PageCard title='AI 模型'>
                <div className='flex flex-col gap-4'>
                    <ModelSettingsEditor onSaved={refreshModels} />
                    <div className='flex flex-wrap items-center gap-2'>
                        <span>默认模型：</span>
                        <SelectField
                            className='w-full max-w-full sm:w-[320px]'
                            value={selectedModel}
                            onValueChange={(id) => void selectModel(id)}
                            options={models.map((model) => ({
                                label: `${model.name}（${model.model}）`,
                                value: model.id,
                            }))}
                        />
                        <BusyButton
                            variant='outline'
                            busy={checking}
                            onClick={() => void checkModel()}
                        >
                            <FlaskConical />
                            视觉自检
                        </BusyButton>
                    </div>
                    <CheckingHint checking={checking} />
                    <CheckResultAlert checkResult={checkResult} />
                    <p className='text-sm text-muted-foreground'>
                        自检不通过的模型不要用于 UI 自动化。「自由指令」动作需要模型带 family
                        配置，没有 family 的模型在启动运行时会被直接拦截并提示。
                    </p>
                </div>
            </PageCard>

            <PageCard
                title='变量'
                extra={
                    <div className='flex gap-2'>
                        <Button
                            variant='outline'
                            onClick={() => setVariables((prev) => [...prev, emptyVariableRow()])}
                        >
                            <Plus />
                            添加变量
                        </Button>
                        <BusyButton busy={savingVariables} onClick={() => void saveVariables()}>
                            保存变量
                        </BusyButton>
                    </div>
                }
            >
                <p className='mb-3 text-sm text-muted-foreground'>
                    YAML 脚本里用 {'{{变量名}}'} 引用，例如账号密码（USERNAME /
                    PASSWORD），避免明文写在任务里。
                </p>
                <div className='flex flex-col gap-2'>
                    <EmptyVariablesHint count={variables.length} />
                    {variables.map((row, index) => (
                        <div key={index} className='flex flex-wrap gap-2'>
                            <Input
                                className='w-[240px]'
                                placeholder='变量名，如 USERNAME'
                                value={row.key}
                                onChange={(e) => updateRow(index, { key: e.target.value })}
                            />
                            <Input
                                className='w-[360px]'
                                placeholder='变量值'
                                value={row.value}
                                onChange={(e) => updateRow(index, { value: e.target.value })}
                            />
                            <Button
                                variant='destructive'
                                size='icon'
                                aria-label='删除变量'
                                onClick={() =>
                                    setVariables((prev) => prev.filter((_, i) => i !== index))
                                }
                            >
                                <Trash2 />
                            </Button>
                        </div>
                    ))}
                </div>
            </PageCard>

            <PageCard
                title='存储占用'
                extra={
                    <BusyButton
                        variant='destructive'
                        busy={cleaning}
                        onClick={() => void confirmCleanup()}
                    >
                        清空历史记录
                    </BusyButton>
                }
            >
                <StorageBody storage={storage} />
                <p className='mt-3 text-sm text-muted-foreground'>
                    系统会自动保留最近 100 次运行并清理更早的；也可以手动清空全部历史。
                </p>
            </PageCard>

            <PageCard title='系统状态'>
                <SystemBody system={system} />
            </PageCard>
        </div>
    );
}
