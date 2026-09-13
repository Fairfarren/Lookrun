// 与 Midscene 1.10.6 的 MODEL_FAMILY_VALUES 对齐；升级依赖时对照官方文档更新。
const MODEL_FAMILIES = [
    { value: 'doubao-seed', label: '豆包 Seed', description: '适用于豆包 Seed 系列视觉模型。' },
    {
        value: 'doubao-vision',
        label: '豆包 Vision（兼容旧配置）',
        description: '豆包旧配置的兼容选项，新配置建议选择 doubao-seed。',
    },
    {
        value: 'qwen3',
        label: '通义千问 Qwen3.x',
        description: '适用于 Qwen3.5、Qwen3.6 等 Qwen3.x 多模态模型；不是 Qwen3-VL。',
    },
    {
        value: 'qwen3.5',
        label: '通义千问 Qwen3.5（兼容旧配置）',
        description: 'Qwen3.5 的兼容选项，新配置可选择 qwen3。',
    },
    {
        value: 'qwen3.6',
        label: '通义千问 Qwen3.6（兼容旧配置）',
        description: 'Qwen3.6 的兼容选项，新配置可选择 qwen3。',
    },
    {
        value: 'qwen3-vl',
        label: '通义千问 Qwen3-VL',
        description: '适用于 Qwen3-VL 系列，例如 qwen3-vl-plus。',
    },
    {
        value: 'qwen2.5-vl',
        label: '通义千问 Qwen2.5-VL',
        description: '适用于 Qwen2.5-VL 系列，例如 qwen-vl-max-latest。',
    },
    { value: 'gemini', label: 'Google Gemini', description: '适用于 Gemini 多模态模型。' },
    {
        value: 'gpt-5',
        label: 'OpenAI GPT-5',
        description:
            '用于视觉定位时需使用 GPT-5.4 或之后支持该能力的型号；较早型号仅支持规划或理解。',
    },
    {
        value: 'kimi',
        label: '月之暗面 Kimi K2.x',
        description: '适用于 Kimi K2.x 多模态型号，例如 kimi-k2.5；不适用于 Kimi K3。',
    },
    {
        value: 'xiaomi-mimo',
        label: '小米 MiMo',
        description: '需选择支持图像输入的多模态型号，纯文本 Pro 型号不能用于视觉任务。',
    },
    {
        value: 'glm-v',
        label: '智谱 GLM-V',
        description: '适用于 GLM 视觉模型，例如 glm-4.6v、glm-5v-turbo。',
    },
    {
        value: 'auto-glm',
        label: '智谱 AutoGLM（中文）',
        description: '适用于 AutoGLM-Phone-9B，侧重中文手机应用操作；断言和查询需另配理解模型。',
    },
    {
        value: 'auto-glm-multilingual',
        label: '智谱 AutoGLM（多语言）',
        description:
            '适用于 AutoGLM-Phone-9B-Multilingual，侧重多语言手机应用操作；断言和查询需另配理解模型。',
    },
    { value: 'vlm-ui-tars', label: 'UI-TARS 1.0', description: '适用于 UI-TARS 1.0。' },
    {
        value: 'vlm-ui-tars-doubao-1.5',
        label: 'UI-TARS 1.5（火山引擎）',
        description: '适用于火山引擎部署的 UI-TARS 1.5。',
    },
    {
        value: 'vlm-ui-tars-doubao',
        label: 'UI-TARS 1.5（兼容别名）',
        description: '与 vlm-ui-tars-doubao-1.5 等价，用于兼容已有配置。',
    },
];

export function ModelFamilyField({
    value,
    onChange,
}: {
    value: string;
    onChange: (value: string) => void;
}) {
    const selected = MODEL_FAMILIES.find((family) => family.value === value);
    return (
        <label className='flex min-w-0 flex-col gap-2 text-sm'>
            模型系列（family，可选）
            <select
                className='h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50'
                value={value}
                onChange={(event) => onChange(event.target.value)}
            >
                <option value=''>不设置</option>
                {value && !selected && (
                    <option value={value}>已有配置：{value}（当前版本未支持）</option>
                )}
                {MODEL_FAMILIES.map((family) => (
                    <option key={family.value} value={family.value}>
                        {family.label}（{family.value}）
                    </option>
                ))}
            </select>
            <span className='text-muted-foreground'>
                {selected?.description ??
                    (value
                        ? '此值不在当前版本支持列表中，请重新选择对应系列。'
                        : '可暂不设置；使用「自由指令」前必须选择实际模型所属系列。')}
            </span>
        </label>
    );
}
