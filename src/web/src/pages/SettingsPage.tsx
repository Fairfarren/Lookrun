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
import type { SystemInfo } from '../../../shared/types';
import { api, type ModelBrief, type StorageStats } from '../api';

interface VariableRow {
    key: string;
    value: string;
}

function formatBytes(bytes: number) {
    if (bytes >= 1024 * 1024) {
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    }
    if (bytes >= 1024) {
        return `${(bytes / 1024).toFixed(0)} KB`;
    }
    return `${bytes} B`;
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
                setSelectedModel(result.selected ?? result.models[0]?.id);
            })
            .catch((error: Error) => message.error(error.message));
        api.getVariables()
            .then((vars) =>
                setVariables(Object.entries(vars).map(([key, value]) => ({ key, value }))),
            )
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
                    message.error(error instanceof Error ? error.message : String(error));
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
            message.error(error instanceof Error ? error.message : String(error));
        }
    };

    const checkModel = async () => {
        if (!selectedModel) {
            return;
        }
        setChecking(true);
        setCheckResult(null);
        try {
            setCheckResult(await api.checkModel(selectedModel));
        } catch (error) {
            setCheckResult({
                ok: false,
                message: error instanceof Error ? error.message : String(error),
            });
        } finally {
            setChecking(false);
        }
    };

    const saveVariables = async () => {
        const invalid = variables.some((row) => row.key.trim() === '');
        if (invalid) {
            message.warning('变量名不能为空');
            return;
        }
        setSavingVariables(true);
        try {
            await api.saveVariables(
                Object.fromEntries(variables.map((row) => [row.key.trim(), row.value])),
            );
            message.success('变量已保存');
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        } finally {
            setSavingVariables(false);
        }
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
                    {checking && (
                        <Space>
                            <Spin size='small' />
                            <Typography.Text type='secondary'>
                                正在向模型发送测试截图，验证能否返回元素坐标，可能需要几十秒...
                            </Typography.Text>
                        </Space>
                    )}
                    {checkResult && (
                        <Alert
                            type={checkResult.ok ? 'success' : 'error'}
                            title={
                                <Space>
                                    {checkResult.ok ? (
                                        <CheckCircleOutlined />
                                    ) : (
                                        <CloseCircleOutlined />
                                    )}
                                    {checkResult.message}
                                </Space>
                            }
                            showIcon={false}
                        />
                    )}
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
                            onClick={() =>
                                setVariables((prev) => [...prev, { key: '', value: '' }])
                            }
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
                    {variables.length === 0 && (
                        <Typography.Text type='secondary'>暂无变量</Typography.Text>
                    )}
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
                {storage ? (
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
                            <Typography.Text strong>
                                {formatBytes(storage.totalBytes)}
                            </Typography.Text>
                            <Typography.Text type='secondary'>
                                {' '}
                                （{storage.runCount} 次运行）
                            </Typography.Text>
                        </Descriptions.Item>
                    </Descriptions>
                ) : (
                    <Spin size='small' />
                )}
                <Typography.Text type='secondary'>
                    系统会自动保留最近 100 次运行并清理更早的；也可以手动清空全部历史。
                </Typography.Text>
            </Card>

            <Card title='系统状态'>
                {system ? (
                    <Descriptions column={1}>
                        <Descriptions.Item label='Chrome 浏览器'>
                            {system.chromePath ? (
                                <Space>
                                    <Tag color='success'>已检测到</Tag>
                                    <Typography.Text copyable={{ text: system.chromePath }}>
                                        {system.chromePath}
                                    </Typography.Text>
                                </Space>
                            ) : (
                                <Alert
                                    type='error'
                                    title='未检测到系统 Chrome，请先安装 Google Chrome：https://www.google.com/chrome/'
                                />
                            )}
                        </Descriptions.Item>
                        <Descriptions.Item label='Android ADB'>
                            {system.adbPath ? (
                                <Space>
                                    <Tag color='success'>已检测到</Tag>
                                    <Typography.Text copyable={{ text: system.adbPath }}>
                                        {system.adbPath}
                                    </Typography.Text>
                                </Space>
                            ) : (
                                <Alert
                                    type='error'
                                    title='未检测到 ADB，请使用包含 platform-tools 的完整程序包'
                                />
                            )}
                        </Descriptions.Item>
                        <Descriptions.Item label='数据目录'>{system.dataDir}</Descriptions.Item>
                        <Descriptions.Item label='版本'>{system.version}</Descriptions.Item>
                    </Descriptions>
                ) : (
                    <Spin size='small' />
                )}
            </Card>
        </Space>
    );
}
