import {
    CheckCircleOutlined,
    CloseCircleOutlined,
    DeleteOutlined,
    ExperimentOutlined,
    PlusOutlined,
} from '@ant-design/icons';
import {
    App as AntApp,
    Alert,
    Button,
    Card,
    Descriptions,
    Input,
    Select,
    Space,
    Spin,
    Tag,
    Typography,
} from 'antd';
import { useEffect, useState } from 'react';
import type { SystemInfo } from '@lookrun/shared';
import { api, type ModelBrief, type StorageStats } from '../api';
import { errorText } from '../utils/error-text';
import { formatBytes } from '../utils/format-bytes';
import {
    checkAlertType,
    checkResultFromError,
    defaultModelId,
    emptyVariableName,
    emptyVariableRow,
    variablesFromRecord,
    variablesToRecord,
} from '../utils/settings-view';

interface VariableRow {
    key: string;
    value: string;
}

function CheckingHint({ checking }: { checking: boolean }) {
    if (!checking) {
        return null;
    }
    return (
        <Space>
            <Spin size='small' />
            <Typography.Text type='secondary'>
                正在向模型发送测试截图，验证能否返回元素坐标，可能需要几十秒...
            </Typography.Text>
        </Space>
    );
}

function CheckResultIcon({ ok }: { ok: boolean }) {
    if (ok) {
        return <CheckCircleOutlined />;
    }
    return <CloseCircleOutlined />;
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
        <Alert
            type={checkAlertType(checkResult.ok)}
            title={
                <Space>
                    <CheckResultIcon ok={checkResult.ok} />
                    {checkResult.message}
                </Space>
            }
            showIcon={false}
        />
    );
}

function EmptyVariablesHint({ count }: { count: number }) {
    if (count > 0) {
        return null;
    }
    return <Typography.Text type='secondary'>还没有变量</Typography.Text>;
}

function StorageBody({ storage }: { storage: StorageStats | null }) {
    if (!storage) {
        return <Spin size='small' />;
    }
    return (
        <Descriptions column={2}>
            <Descriptions.Item label='步骤截图'>
                {formatBytes(storage.screenshotsBytes)}
            </Descriptions.Item>
            <Descriptions.Item label='Midscene 报告'>
                {formatBytes(storage.reportsBytes)}
            </Descriptions.Item>
            <Descriptions.Item label='数据库'>
                {formatBytes(storage.databaseBytes)}
            </Descriptions.Item>
            <Descriptions.Item label='总计'>
                <Typography.Text strong>{formatBytes(storage.totalBytes)}</Typography.Text>
                <Typography.Text type='secondary'> （{storage.runCount} 次运行）</Typography.Text>
            </Descriptions.Item>
        </Descriptions>
    );
}

function DetectedPath({ path, missingTitle }: { path: string | null; missingTitle: string }) {
    if (!path) {
        return <Alert type='error' title={missingTitle} />;
    }
    return (
        <Space>
            <Tag color='success'>已检测到</Tag>
            <Typography.Text copyable={{ text: path }}>{path}</Typography.Text>
        </Space>
    );
}

function SystemBody({ system }: { system: SystemInfo | null }) {
    if (!system) {
        return <Spin size='small' />;
    }
    return (
        <Descriptions column={1}>
            <Descriptions.Item label='Chrome 浏览器'>
                <DetectedPath
                    path={system.chromePath}
                    missingTitle='未检测到系统 Chrome，请先安装 Google Chrome：https://www.google.com/chrome/'
                />
            </Descriptions.Item>
            <Descriptions.Item label='Android ADB'>
                <DetectedPath
                    path={system.adbPath}
                    missingTitle='未检测到 ADB，请使用包含 platform-tools 的完整程序包'
                />
            </Descriptions.Item>
            <Descriptions.Item label='数据目录'>{system.dataDir}</Descriptions.Item>
            <Descriptions.Item label='版本'>{system.version}</Descriptions.Item>
        </Descriptions>
    );
}

export default function SettingsPage() {
    const { message, modal } = AntApp.useApp();
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

    useEffect(() => {
        api.listModels()
            .then((result) => {
                setModels(result.models);
                setSelectedModel(defaultModelId(result.selected, result.models[0]?.id));
            })
            .catch((error: Error) => message.error(error.message));
        api.getVariables()
            .then((vars) => setVariables(variablesFromRecord(vars)))
            .catch((error: Error) => message.error(error.message));
        api.systemInfo()
            .then(setSystem)
            .catch(() => {});
        loadStorage();
    }, []);

    const confirmCleanup = () => {
        modal.confirm({
            title: '清空全部历史记录？',
            content: '将删除所有运行记录、步骤日志和截图，任务与变量不受影响。此操作不可恢复。',
            okText: '全部清空',
            okButtonProps: { danger: true },
            cancelText: '取消',
            onOk: async () => {
                setCleaning(true);
                try {
                    const result = await api.cleanupStorage();
                    message.success(
                        `已清空 ${result.deletedRuns} 次运行，释放 ${formatBytes(result.freedBytes)}`,
                    );
                    loadStorage();
                } catch (error) {
                    message.error(errorText(error));
                } finally {
                    setCleaning(false);
                }
            },
        });
    };

    const selectModel = async (id: string) => {
        setSelectedModel(id);
        setCheckResult(null);
        try {
            await api.selectModel(id);
            message.success('默认模型已更新');
        } catch (error) {
            message.error(errorText(error));
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
            message.success('变量已保存');
        } catch (error) {
            message.error(errorText(error));
        } finally {
            setSavingVariables(false);
        }
    };

    const saveVariables = async () => {
        if (emptyVariableName(variables)) {
            message.warning('变量名不能为空');
            return;
        }
        setSavingVariables(true);
        await persistVariables();
    };

    const updateRow = (index: number, patch: Partial<VariableRow>) => {
        setVariables((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    };

    return (
        <Space orientation='vertical' size='middle' style={{ width: '100%' }}>
            <Card title='AI 模型'>
                <Space orientation='vertical' size='middle' style={{ width: '100%' }}>
                    <Space wrap>
                        <Typography.Text>默认模型：</Typography.Text>
                        <Select
                            style={{ minWidth: 320 }}
                            value={selectedModel}
                            onChange={selectModel}
                            options={models.map((model) => ({
                                label: `${model.name}（${model.model}）`,
                                value: model.id,
                            }))}
                        />
                        <Button
                            icon={<ExperimentOutlined />}
                            loading={checking}
                            onClick={checkModel}
                        >
                            视觉自检
                        </Button>
                    </Space>
                    <CheckingHint checking={checking} />
                    <CheckResultAlert checkResult={checkResult} />
                    <Typography.Text type='secondary'>
                        模型列表在打包时内置（resources/models.json），修改后需重新打包；运行时用
                        data/models.json 可覆盖。 自检不通过的模型不要用于 UI
                        自动化。「自由指令」动作需要模型带 family 配置，没有 family
                        的模型在启动运行时会被直接拦截并提示。
                    </Typography.Text>
                </Space>
            </Card>

            <Card
                title='变量'
                extra={
                    <Space>
                        <Button
                            icon={<PlusOutlined />}
                            onClick={() => setVariables((prev) => [...prev, emptyVariableRow()])}
                        >
                            添加变量
                        </Button>
                        <Button type='primary' loading={savingVariables} onClick={saveVariables}>
                            保存变量
                        </Button>
                    </Space>
                }
            >
                <Typography.Paragraph type='secondary'>
                    YAML 脚本里用 {'{{变量名}}'} 引用，例如账号密码（USERNAME /
                    PASSWORD），避免明文写在任务里。
                </Typography.Paragraph>
                <Space orientation='vertical' style={{ width: '100%' }}>
                    <EmptyVariablesHint count={variables.length} />
                    {variables.map((row, index) => (
                        <Space key={index}>
                            <Input
                                style={{ width: 240 }}
                                placeholder='变量名，如 USERNAME'
                                value={row.key}
                                onChange={(e) => updateRow(index, { key: e.target.value })}
                            />
                            <Input
                                style={{ width: 360 }}
                                placeholder='变量值'
                                value={row.value}
                                onChange={(e) => updateRow(index, { value: e.target.value })}
                            />
                            <Button
                                danger
                                icon={<DeleteOutlined />}
                                onClick={() =>
                                    setVariables((prev) => prev.filter((_, i) => i !== index))
                                }
                            />
                        </Space>
                    ))}
                </Space>
            </Card>

            <Card
                title='存储占用'
                extra={
                    <Button danger loading={cleaning} onClick={confirmCleanup}>
                        清空历史记录
                    </Button>
                }
            >
                <StorageBody storage={storage} />
                <Typography.Text type='secondary'>
                    系统会自动保留最近 100 次运行并清理更早的；也可以手动清空全部历史。
                </Typography.Text>
            </Card>

            <Card title='系统状态'>
                <SystemBody system={system} />
            </Card>
        </Space>
    );
}
