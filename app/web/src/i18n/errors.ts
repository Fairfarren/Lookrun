import { getLocale } from './index';

const englishErrors: Record<string, string> = {
    '服务地址必须是有效的 HTTP 或 HTTPS 地址': 'Enter a valid HTTP or HTTPS base URL',
    '服务地址必须使用 HTTP 或 HTTPS，且不能包含凭据、查询参数或片段':
        'The base URL must use HTTP or HTTPS, with no credentials, query parameters or fragment',
    模型标识不能重复: 'Model IDs must be unique',
    '模型 {model} 不存在': 'Model {model} was not found',
    '任务包含「自由指令」步骤，需要模型配置 family；模型「{model}」没有 family，请改用 kimi，或把该步骤改成具体动作（点击/输入/断言等）':
        'This task uses AI instruction, which requires a model family. Model “{model}” has no family. Configure the correct family or use specific actions such as tap, input or assert.',
    '未检测到系统 Chrome，请先安装 Google Chrome 浏览器':
        'Chrome was not found. Install Google Chrome first.',
    '程序重启，运行中断': 'The application restarted and interrupted this run',
    手动停止: 'Stopped manually',
    '第 {index} 步（{step}）失败：{reason}': 'Step {index} ({step}) failed: {reason}',
    '网页运行需要 web 目标': 'A web run requires a web target',
    'Android 运行需要 android 目标': 'An Android run requires an Android target',
    'ADB 命令执行失败': 'The ADB command failed',
    '未找到 ADB，请使用包含 platform-tools 的完整程序包':
        'ADB was not found. Use the complete application package with platform-tools.',
    '打开 App 步骤只能由 Android 任务执行': 'Launch app is only available for Android tasks',
    'MOCK 模拟的步骤失败': 'Simulated step failure',
    '断言不通过：{detail}': 'Assertion failed: {detail}',
    '未知动作：{action}': 'Unknown action: {action}',
    '动作 {action} 需要 Agent': 'Action {action} requires an agent',
    '无法解析 Android 屏幕尺寸：{detail}': 'Cannot read the Android screen dimensions: {detail}',
    '设备的应用列表中没有找到名为「{app}」的 App，请检查名称或改填准确包名':
        'App “{app}” was not found on this device. Check the name or enter its package name.',
    '设备 {device} 未连接或未授权': 'Device {device} is disconnected or unauthorized',
    'API Key 含有非法字符，无法用于请求（请检查是否仍是占位符）':
        'The API key contains invalid characters. Check whether it is still a placeholder.',
    '模型配置缺少 apiKey': 'Model settings are missing apiKey',
    '模型配置的 models 必须是非空数组': 'Model settings must contain a non-empty models array',
    模型配置必须是一个对象: 'Model settings must be an object',
    '模型配置缺少 baseUrl': 'Model settings are missing baseUrl',
    '第 {index} 个模型缺少 id': 'Model {index} is missing its ID',
    '第 {index} 个模型缺少 model 字段': 'Model {index} is missing the model field',
    '运行时模型配置 {path} 解析失败：{reason}': 'Cannot parse model settings at {path}: {reason}',
    模型不存在: 'Model not found',
    'bbox 必须是 4 个数字的数组': 'bbox must be an array of four numbers',
    'bbox 面积为零': 'bbox has zero area',
    'bbox JSON 无法解析': 'Cannot parse bbox JSON',
    '回复中没有找到 bbox JSON': 'No bbox JSON was found in the response',
    '定位偏差过大：bbox [{coordinates}] 未覆盖画面中心的按钮':
        'The location is inaccurate: bbox [{coordinates}] does not cover the button at the center',
    'bbox 既不是合法像素坐标也不是 0-1000 归一化坐标：[{coordinates}]':
        'bbox is neither valid pixel coordinates nor normalized coordinates from 0 to 1000: [{coordinates}]',
    '接口返回 {status}：{detail}': 'The API returned {status}: {detail}',
    '视觉能力正常（0-1000 归一化坐标），定位坐标 [{coordinates}]':
        'Vision check passed (normalized coordinates from 0 to 1000): [{coordinates}]',
    '视觉能力正常（绝对像素坐标），定位坐标 [{coordinates}]':
        'Vision check passed (pixel coordinates): [{coordinates}]',
    '模型无法用于 UI 自动化：{reason}': 'The model cannot be used for UI automation: {reason}',
    '自检请求失败：{reason}': 'Vision check request failed: {reason}',
    '模型配置文件无法读取，请检查 data/models.json':
        'Cannot read model settings. Check data/models.json.',
    '模型配置请求或现有配置无法解析，请检查 JSON 格式':
        'Cannot parse model settings. Check the JSON format.',
    '模型配置保存失败，请检查数据目录写入权限':
        'Cannot save model settings. Check write permissions for the data directory.',
    队列不存在: 'Queue not found',
    '队列为空，没有可执行的任务': 'The queue is empty and has no tasks to run',
    '任务 #{id} 不存在，已跳过': 'Task #{id} was not found and was skipped',
    '任务「{task}」校验失败：{reason}': 'Task “{task}” failed validation: {reason}',
    '任务「{task}」启动失败：{reason}': 'Task “{task}” could not start: {reason}',
    脚本校验失败: 'Script validation failed',
    任务不存在: 'Task not found',
    运行记录不存在: 'Run not found',
    请选择要检查的设备: 'Select a device to check',
    请选择要查询应用的设备: 'Select a device to list its apps',
    '任务名和 YAML 内容不能为空': 'Task name and YAML cannot be empty',
    队列名不能为空: 'Queue name cannot be empty',
    'direction 必须是 up 或 down': 'direction must be up or down',
    'variables 必须是对象': 'variables must be an object',
    '缺少 taskId 或 modelId': 'taskId or modelId is missing',
    '{context}：timeout 只能用于 aiWaitFor 步骤':
        '{context}: timeout is only supported by aiWaitFor',
    '{context}：timeout 必须是正数毫秒':
        '{context}: timeout must be a positive number in milliseconds',
    '{context}：name 必须是字符串': '{context}: name must be a string',
    '{context}（launch）：打开 App 只能用于 Android 任务':
        '{context} (launch): Launch app is only supported by Android tasks',
    '{context}（launch）：需要填写 App 名称、包名或包名/Activity':
        '{context} (launch): enter an app name, package name or package/Activity',
    '{context}（aiInput）：需要 locate 字段描述输入框位置':
        '{context} (aiInput): locate must describe the input field',
    '{context}（aiInput）：需要 value 字段填写输入内容':
        '{context} (aiInput): value must contain the text to enter',
    '{context}（sleep）：等待毫秒数必须是正数':
        '{context} (sleep): the wait must be a positive number of milliseconds',
    '{context}（aiScroll）：direction 必须是 up/down/left/right 之一':
        '{context} (aiScroll): direction must be up, down, left or right',
    '{context}（{action}）：Android 任务不支持该动作':
        '{context} ({action}): this action is not supported by Android tasks',
    '{context}（{action}）：缺少指令内容': '{context} ({action}): instruction text is missing',
    '第 {index} 步': 'Step {index}',
    '{context}：步骤必须是一个动作对象': '{context}: a step must be an action object',
    '{context}：url 应写在步骤组上，不要写在单个步骤里':
        '{context}: put url on the step group rather than an individual step',
    '{context}：一个步骤只能写一个动作，当前写了 {count} 个（{actions}）':
        '{context}: a step must have one action; found {count} ({actions})',
    '{context}：不支持的动作 "{action}"，支持：{actions}':
        '{context}: unsupported action "{action}"; supported actions: {actions}',
    'android.deviceId 必须是非空设备号': 'android.deviceId must be a non-empty device ID',
    '网页 target 和 android 只能配置一个': 'Configure either target or android, not both',
    '{field} 必须是数字': '{field} must be a number',
    '缺少 target 字段（被测页面地址）': 'target is missing (the page URL to test)',
    'target 必须是 http(s) 地址，当前是：{url}': 'target must be an HTTP(S) URL; received: {url}',
    '{context}：url 只能用于网页任务': '{context}: url is only supported by web tasks',
    '{context}：url 必须是非空字符串': '{context}: url must be a non-empty string',
    '{context}：url 必须是 http(s) 地址，当前是：{url}':
        '{context}: url must be an HTTP(S) URL; received: {url}',
    '任务 {index}': 'Task {index}',
    '{context}：必须是对象': '{context}: must be an object',
    '{context}：缺少 name 字段（步骤组名称）': '{context}: name is missing (the step group name)',
    '{context}：flow 必须是非空数组': '{context}: flow must be a non-empty array',
    'YAML 语法错误：{detail}': 'YAML syntax error: {detail}',
    'tasks 必须是非空数组': 'tasks must be a non-empty array',
    '存在未定义的变量：{variables}（请先在「设置-变量」里配置）':
        'Undefined variables: {variables}. Configure them in Settings → Variables first.',
    '脚本内容必须是一个 YAML 对象': 'The script must be a YAML object',
    'API Key 未配置或含有非法字符，请在 models.json 中填写有效的 API Key':
        'The API key is missing or invalid. Configure a valid key in Settings → AI models.',
    'API Key 无效，请检查 models.json 中的配置':
        'The API key is invalid. Check Settings → AI models.',
};

const errorPatterns = Object.entries(englishErrors).map(([source, translated]) => {
    const names: string[] = [];
    const pattern = source
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\\\{(\w+)\\\}/g, (_placeholder, name: string) => {
            names.push(name);
            return /^(index|id|count|status)$/.test(name) ? '(\\d+)' : '([\\s\\S]*?)';
        });
    return { translated, names, pattern: new RegExp(`^${pattern}$`) };
});

// 只在错误和服务提示边界使用，任务名、步骤指令等用户内容不参与匹配。
export function translateError(message: string): string {
    if (getLocale() === 'zh-CN') return message;
    for (const entry of errorPatterns) {
        const match = entry.pattern.exec(message);
        if (!match) continue;
        const values = Object.fromEntries(
            entry.names.map((name, index) => {
                const value = match[index + 1]!;
                return [
                    name,
                    name === 'reason' || name === 'context'
                        ? value.split('；').map(translateError).join('; ')
                        : value,
                ];
            }),
        );
        return entry.translated.replace(/\{(\w+)\}/g, (_placeholder, name: string) => values[name]);
    }
    return message;
}
