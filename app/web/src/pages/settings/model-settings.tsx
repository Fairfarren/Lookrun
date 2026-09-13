import { ModelFamilyField } from './model-family-field';
import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { BusyButton } from '../../components/busy-button';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { notify } from '../../components/notify';
import { errorText } from '../../utils/error-text';
import { modelSettingsApi, type ModelSettings } from './api';

export function ModelSettingsEditor({ onSaved }: { onSaved: () => void }) {
    const [config, setConfig] = useState<ModelSettings | null>(null);
    const [apiKey, setApiKey] = useState('');
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState('');
    const load = () => {
        setLoadError('');
        modelSettingsApi
            .read()
            .then(setConfig)
            .catch((error) => setLoadError(errorText(error)));
    };
    useEffect(load, []);
    if (!config) return <ModelSettingsLoading error={loadError} onRetry={load} />;
    const updateModel = (index: number, patch: Partial<ModelSettings['models'][number]>) => {
        setConfig({
            ...config,
            models: config.models.map((model, i) => (i === index ? { ...model, ...patch } : model)),
        });
    };
    const save = async () => {
        setSaving(true);
        try {
            const saved = await modelSettingsApi.save({ ...config, apiKey });
            setConfig(saved);
            setApiKey('');
            notify.success('模型配置已保存，后续运行立即生效');
            onSaved();
        } catch (error) {
            notify.error(errorText(error));
        } finally {
            setSaving(false);
        }
    };
    return (
        <fieldset disabled={saving} className='flex min-w-0 flex-col gap-4 border-b pb-5'>
            <div className='grid gap-4 md:grid-cols-2'>
                <label className='flex flex-col gap-2 text-sm'>
                    服务地址
                    <Input
                        value={config.baseUrl}
                        placeholder='https://example.com/v1'
                        onChange={(event) => setConfig({ ...config, baseUrl: event.target.value })}
                    />
                    <span className='text-muted-foreground'>
                        填写兼容 OpenAI 的接口地址，包含服务所需的 /v1。
                    </span>
                </label>
                <label className='flex flex-col gap-2 text-sm'>
                    API Key
                    <Input
                        type='password'
                        autoComplete='new-password'
                        value={apiKey}
                        placeholder={apiKeyPlaceholder(config.hasApiKey)}
                        onChange={(event) => setApiKey(event.target.value)}
                    />
                    <span className='text-muted-foreground'>
                        密钥保存在本机数据目录，保存后不回显。
                    </span>
                </label>
            </div>
            <p className='text-sm text-muted-foreground'>
                模型系列决定如何处理截图坐标和适配模型。请按实际模型选择，不能仅按接口服务商选择，也不会自动更改模型名称。
                例如 qwen3-vl-plus 对应 qwen3-vl，kimi-k2.5 对应 kimi。
                <a
                    className='ml-1 underline underline-offset-4'
                    href='https://www.midscenejs.com/model-common-config'
                    target='_blank'
                    rel='noreferrer'
                >
                    查看官方配置说明
                </a>
            </p>
            <div className='flex flex-col gap-3'>
                {config.models.map((model, index) => (
                    <div
                        key={model.id}
                        className='grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]'
                    >
                        <label className='flex flex-col gap-2 text-sm'>
                            显示名称
                            <Input
                                value={model.name}
                                placeholder='例如：视觉模型'
                                onChange={(event) =>
                                    updateModel(index, { name: event.target.value })
                                }
                            />
                        </label>
                        <label className='flex flex-col gap-2 text-sm'>
                            模型名称
                            <Input
                                value={model.model}
                                placeholder='服务商提供的模型名称'
                                onChange={(event) =>
                                    updateModel(index, { model: event.target.value })
                                }
                            />
                        </label>
                        <ModelFamilyField
                            value={model.family}
                            onChange={(family) => updateModel(index, { family })}
                        />
                        <Button
                            className='self-start sm:mt-7'
                            variant='outline'
                            size='icon'
                            aria-label={`删除模型 ${model.name || index + 1}`}
                            disabled={config.models.length <= 1}
                            onClick={() =>
                                setConfig({
                                    ...config,
                                    models: config.models.filter((_, i) => i !== index),
                                })
                            }
                        >
                            <Trash2 />
                        </Button>
                    </div>
                ))}
            </div>
            <div className='flex flex-wrap gap-2'>
                <Button
                    variant='outline'
                    onClick={() =>
                        setConfig({
                            ...config,
                            models: [
                                ...config.models,
                                { id: crypto.randomUUID(), name: '', model: '', family: '' },
                            ],
                        })
                    }
                >
                    <Plus />
                    添加模型
                </Button>
                <BusyButton busy={saving} onClick={() => void save()}>
                    保存模型配置
                </BusyButton>
            </div>
            <p className='text-sm text-muted-foreground'>
                所有模型共用上方服务地址和密钥。编辑后请先保存，再选择默认模型或进行视觉自检。
            </p>
        </fieldset>
    );
}

function ModelSettingsLoading({ error, onRetry }: { error: string; onRetry: () => void }) {
    return (
        <div role='status'>
            {error || '正在加载模型配置…'}
            {error && (
                <Button variant='outline' onClick={onRetry}>
                    重试
                </Button>
            )}
        </div>
    );
}
function apiKeyPlaceholder(hasApiKey: boolean) {
    return hasApiKey ? '已配置，留空保留原密钥' : '请输入 API Key';
}
