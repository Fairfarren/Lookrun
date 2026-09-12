import { yaml } from '@codemirror/lang-yaml';
import { DeleteOutlined, HolderOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import {
    DndContext,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import CodeMirror from '@uiw/react-codemirror';
import {
    App as AntApp,
    Alert,
    AutoComplete,
    Button,
    Card,
    Flex,
    Input,
    InputNumber,
    Segmented,
    Select,
    Space,
    Typography,
} from 'antd';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    ACTION_OPTIONS,
    actionOptionsForTarget,
    type AndroidAppRecord,
    type AndroidDeviceRecord,
    type FormScript,
    type FormStep,
    type FormTask,
} from '@lookrun/shared';
import { api } from '../api';
import { createAndroidAppOptions } from '../utils/android-app-options';
import { reorderById } from '../utils/sortable-items';
import { useThemeMode } from '../theme/context';
import { CARD_ACTIONS_STYLE, CARD_HEADER_WRAP_STYLE } from '../styles/layout';
import { scriptValidationBanner } from '../utils/script-validation';
import { createValidationErrorKey } from '../utils/validation-errors';
import { errorText } from '../utils/error-text';
import { draggingItemStyle } from '../utils/sortable-style';
import {
    androidDeviceId,
    applyLoadedTaskYaml,
    canCheckAndroidDevice,
    createEmptyForm,
    createEmptyStep,
    createEmptyTask,
    currentYamlText,
    editorModeSwitch,
    isNewEditRoute,
    isAndroidLaunchField,
    stepFieldKind,
    taskEditTitle,
    taskNameError,
    fieldNumberValue,
    fieldSelectValue,
    fieldStringValue,
    firstDeviceId,
    formWithTargetType,
    optionalDeviceId,
    urlText,
    withDefaultAndroidDevice,
    withWebUrl,
    withWebViewportHeight,
    withWebViewportWidth,
    yamlValidateError,
} from '../utils/task-form';

const VALIDATE_DEBOUNCE_MS = 800;

interface SortableListProps {
    ids: string[];
    onReorder: (activeId: string, overId: string) => void;
    children: ReactNode;
}

function SortableList({ ids, onReorder, children }: SortableListProps) {
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={({ active, over }) => {
                if (over) onReorder(String(active.id), String(over.id));
            }}
        >
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                {children}
            </SortableContext>
        </DndContext>
    );
}

interface SortableTaskCardProps {
    id: string;
    index: number;
    name: string;
    canDelete: boolean;
    onNameChange: (name: string) => void;
    onDelete: () => void;
    children: ReactNode;
}

function SortableTaskCard({
    id,
    index,
    name,
    canDelete,
    onNameChange,
    onDelete,
    children,
}: SortableTaskCardProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        setActivatorNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id });

    return (
        <Card
            ref={setNodeRef}
            size='small'
            style={{
                transform: CSS.Transform.toString(transform),
                transition,
                opacity: draggingItemStyle(isDragging).opacity,
                position: 'relative',
                zIndex: draggingItemStyle(isDragging).zIndex,
            }}
            title={
                <Space>
                    <Button
                        ref={setActivatorNodeRef}
                        type='text'
                        size='small'
                        icon={<HolderOutlined />}
                        aria-label={`拖拽第 ${index + 1} 个步骤组进行排序`}
                        title='拖拽排序'
                        style={{
                            cursor: draggingItemStyle(isDragging).cursor,
                            touchAction: 'none',
                        }}
                        {...attributes}
                        {...listeners}
                    />
                    <Typography.Text type='secondary'>{`${index + 1}.`}</Typography.Text>
                    <Input
                        style={{ maxWidth: 320 }}
                        placeholder='步骤组名称，如：登录'
                        value={name}
                        onChange={(event) => onNameChange(event.target.value)}
                    />
                </Space>
            }
            extra={
                <Button
                    size='small'
                    danger
                    icon={<DeleteOutlined />}
                    disabled={!canDelete}
                    onClick={onDelete}
                />
            }
        >
            {children}
        </Card>
    );
}

interface SortableStepRowProps {
    id: string;
    index: number;
    children: ReactNode;
}

function SortableStepRow({ id, index, children }: SortableStepRowProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        setActivatorNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id });

    return (
        <Flex
            ref={setNodeRef}
            gap={8}
            align='center'
            wrap='wrap'
            style={{
                transform: CSS.Transform.toString(transform),
                transition,
                opacity: draggingItemStyle(isDragging).opacity,
                position: 'relative',
                zIndex: draggingItemStyle(isDragging).zIndex,
            }}
        >
            <Button
                ref={setActivatorNodeRef}
                type='text'
                size='small'
                icon={<HolderOutlined />}
                aria-label={`拖拽第 ${index + 1} 个步骤进行排序`}
                title='拖拽排序'
                style={{ cursor: draggingItemStyle(isDragging).cursor, touchAction: 'none' }}
                {...attributes}
                {...listeners}
            />
            <Typography.Text type='secondary' style={{ width: 24 }}>
                {index + 1}.
            </Typography.Text>
            {children}
        </Flex>
    );
}

function appFilterOption(inputValue: string, currentOption: { value?: string } | undefined) {
    return String(currentOption?.value ?? '')
        .toLocaleLowerCase()
        .includes(inputValue.toLocaleLowerCase());
}

function appsNotFoundContent(loadingApps: boolean) {
    if (loadingApps) {
        return '正在读取应用列表…';
    }
    return '没有匹配包名，可直接输入应用名称或包名';
}

function SelectStepField(input: {
    field: { key: string; options?: { label: string; value: string }[] };
    value: unknown;
    onChange: (next: string | number | undefined) => void;
}) {
    return (
        <Select
            key={input.field.key}
            style={{ width: 110 }}
            value={fieldSelectValue(input.value)}
            options={input.field.options}
            onChange={input.onChange}
        />
    );
}

function AndroidLaunchField(input: {
    field: { key: string; placeholder?: string; label: string };
    value: unknown;
    androidApps: AndroidAppRecord[];
    loadingApps: boolean;
    deviceId: string;
    onChange: (next: string | number | undefined) => void;
    onReloadApps: () => void;
}) {
    return (
        <Flex key={input.field.key} gap={8} style={{ flex: 1, minWidth: 280 }}>
            <AutoComplete
                style={{ flex: 1 }}
                value={fieldStringValue(input.value)}
                options={createAndroidAppOptions(input.androidApps)}
                placeholder={input.field.placeholder ?? input.field.label}
                notFoundContent={appsNotFoundContent(input.loadingApps)}
                filterOption={appFilterOption}
                onChange={input.onChange}
            />
            <Button
                icon={<ReloadOutlined />}
                loading={input.loadingApps}
                disabled={!input.deviceId}
                title='刷新应用列表'
                onClick={input.onReloadApps}
            />
        </Flex>
    );
}

function NumberStepField(input: {
    field: { key: string; placeholder?: string; label: string };
    value: unknown;
    onChange: (next: string | number | undefined) => void;
}) {
    return (
        <InputNumber
            key={input.field.key}
            style={{ width: 130 }}
            min={1}
            placeholder={input.field.placeholder ?? input.field.label}
            value={fieldNumberValue(input.value)}
            onChange={(next) => input.onChange(next ?? undefined)}
        />
    );
}

function TextStepField(input: {
    field: { key: string; placeholder?: string; label: string };
    value: unknown;
    onChange: (next: string | number | undefined) => void;
}) {
    return (
        <Input
            key={input.field.key}
            style={{ flex: 1, minWidth: 140 }}
            placeholder={input.field.placeholder ?? input.field.label}
            value={fieldStringValue(input.value)}
            onChange={(event) => input.onChange(event.target.value)}
        />
    );
}

function StepFieldByKind(input: {
    kind: string;
    field: {
        key: string;
        placeholder?: string;
        label: string;
        options?: { label: string; value: string }[];
    };
    value: unknown;
    androidApps: AndroidAppRecord[];
    loadingApps: boolean;
    deviceId: string;
    onChange: (next: string | number | undefined) => void;
    onReloadApps: () => void;
}) {
    if (input.kind === 'select') {
        return (
            <SelectStepField field={input.field} value={input.value} onChange={input.onChange} />
        );
    }
    return <StepFieldRest {...input} />;
}

function StepFieldRest(input: {
    kind: string;
    field: { key: string; placeholder?: string; label: string };
    value: unknown;
    androidApps: AndroidAppRecord[];
    loadingApps: boolean;
    deviceId: string;
    onChange: (next: string | number | undefined) => void;
    onReloadApps: () => void;
}) {
    if (input.kind === 'android-launch') {
        return <AndroidLaunchField {...input} />;
    }
    return <StepFieldInput {...input} />;
}

function StepFieldInput(input: {
    kind: string;
    field: { key: string; placeholder?: string; label: string };
    value: unknown;
    onChange: (next: string | number | undefined) => void;
}) {
    if (input.kind === 'number') {
        return <NumberStepField {...input} />;
    }
    return <TextStepField {...input} />;
}

function WebTargetEditor(input: { form: FormScript; onFormChange: (form: FormScript) => void }) {
    if (input.form.target.type !== 'web') {
        return null;
    }
    const target = input.form.target;
    return (
        <>
            <Flex gap={12} wrap='wrap' align='center'>
                <Typography.Text strong>起始页面</Typography.Text>
                <Input
                    style={{ flex: 1, minWidth: 260 }}
                    placeholder='起始页面地址，如 https://h5.example.com'
                    value={target.url}
                    onChange={(event) =>
                        input.onFormChange(withWebUrl(input.form, event.target.value))
                    }
                />
                <InputNumber
                    placeholder='视口宽(默认390)'
                    min={320}
                    value={target.viewportWidth}
                    onChange={(value) =>
                        input.onFormChange(withWebViewportWidth(input.form, value ?? undefined))
                    }
                />
                <InputNumber
                    placeholder='视口高(默认844)'
                    min={320}
                    value={target.viewportHeight}
                    onChange={(value) =>
                        input.onFormChange(withWebViewportHeight(input.form, value ?? undefined))
                    }
                />
            </Flex>
            <Typography.Text type='secondary'>
                每个步骤组可另填页面地址。相同地址会回到已打开的页面，不会新开，适合 H5
                发验证码后再去后台接码。
            </Typography.Text>
        </>
    );
}

function AndroidTargetEditor(input: {
    form: FormScript;
    androidDevices: AndroidDeviceRecord[];
    loadingDevices: boolean;
    checkingDevice: boolean;
    onFormChange: (form: FormScript) => void;
    onReloadDevices: () => void;
    onCheckDevice: () => void;
}) {
    if (input.form.target.type !== 'android') {
        return null;
    }
    return (
        <Flex gap={12} wrap='wrap' align='center'>
            <Typography.Text strong>设备号</Typography.Text>
            <Select
                style={{ flex: 1, minWidth: 320 }}
                loading={input.loadingDevices}
                placeholder='选择已连接并授权的 Android 设备'
                value={optionalDeviceId(input.form.target.deviceId)}
                options={input.androidDevices.map((device) => ({
                    label: `${device.name}（${device.id}）`,
                    value: device.id,
                }))}
                onChange={(deviceId) =>
                    input.onFormChange({
                        ...input.form,
                        target: { type: 'android', deviceId },
                    })
                }
            />
            <Button
                icon={<ReloadOutlined />}
                loading={input.loadingDevices}
                onClick={input.onReloadDevices}
            >
                刷新设备
            </Button>
            <Button
                loading={input.checkingDevice}
                disabled={!input.form.target.deviceId}
                onClick={input.onCheckDevice}
            >
                检查连接
            </Button>
        </Flex>
    );
}

function TargetEditor(input: {
    form: FormScript;
    androidDevices: AndroidDeviceRecord[];
    loadingDevices: boolean;
    checkingDevice: boolean;
    onFormChange: (form: FormScript) => void;
    onReloadDevices: () => void;
    onCheckDevice: () => void;
}) {
    return (
        <>
            <WebTargetEditor form={input.form} onFormChange={input.onFormChange} />
            <AndroidTargetEditor {...input} />
        </>
    );
}

function YamlLockedAlert({ yamlLocked }: { yamlLocked: boolean }) {
    if (!yamlLocked) {
        return null;
    }
    return (
        <Alert
            type='warning'
            title='此脚本包含表单编辑器不支持的内容（如高级参数），已用 YAML 模式编辑'
            style={{ marginBottom: 12 }}
        />
    );
}

function ModeEditor(input: { mode: string; formEditor: ReactNode; yamlEditor: ReactNode }) {
    if (input.mode === 'form') {
        return input.formEditor;
    }
    return input.yamlEditor;
}

function BannerPending({ banner }: { banner: string }) {
    if (banner !== 'pending') {
        return null;
    }
    return <Alert data-testid='script-validation-banner' type='info' title='正在校验' />;
}

function BannerError({ banner, errors }: { banner: string; errors: string[] }) {
    if (banner !== 'error') {
        return null;
    }
    return (
        <Alert
            data-testid='script-validation-banner'
            type='error'
            title='脚本存在问题'
            description={
                <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                    {errors.map((error, errorIndex) => (
                        <li key={createValidationErrorKey(error, errorIndex)}>{error}</li>
                    ))}
                </ul>
            }
        />
    );
}

function BannerSuccess({ banner }: { banner: string }) {
    if (banner !== 'success') {
        return null;
    }
    return (
        <Alert data-testid='script-validation-banner' type='success' title='校验通过' showIcon />
    );
}

function TaskGroupUrl(input: {
    targetType: string;
    url: string | undefined;
    onChange: (url: string) => void;
}) {
    if (input.targetType !== 'web') {
        return null;
    }
    return (
        <Input
            placeholder='本步骤组页面地址（可选，相同则复用）'
            value={urlText(input.url)}
            onChange={(event) => input.onChange(event.target.value)}
        />
    );
}

function StepField(input: {
    field: {
        key: string;
        type: string;
        placeholder?: string;
        label: string;
        options?: { label: string; value: string }[];
    };
    step: FormStep;
    value: unknown;
    targetType: string;
    androidApps: AndroidAppRecord[];
    loadingApps: boolean;
    deviceId: string;
    onChange: (next: string | number | undefined) => void;
    onReloadApps: () => void;
}) {
    const kind = stepFieldKind(
        input.field.type,
        isAndroidLaunchField({
            action: input.step.action,
            fieldKey: input.field.key,
            targetType: input.targetType,
        }),
    );
    return <StepFieldByKind {...input} kind={kind} />;
}

export default function TaskEditPage() {
    const themeMode = useThemeMode();
    const { id } = useParams();
    const isNew = isNewEditRoute(id);
    const { message } = AntApp.useApp();
    const navigate = useNavigate();

    const [mode, setMode] = useState<'form' | 'yaml'>('form');
    const [name, setName] = useState('');
    const [form, setForm] = useState<FormScript>(createEmptyForm);
    const [yamlText, setYamlText] = useState('');
    // 从 YAML 高级模式加载的脚本无法转回表单时，锁定在 YAML 模式并提示
    const [yamlLocked, setYamlLocked] = useState(false);
    const [errors, setErrors] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);
    const [loaded, setLoaded] = useState(isNew);
    const [validated, setValidated] = useState(false);
    const [androidDevices, setAndroidDevices] = useState<AndroidDeviceRecord[]>([]);
    const [androidApps, setAndroidApps] = useState<AndroidAppRecord[]>([]);
    const [loadingDevices, setLoadingDevices] = useState(false);
    const [loadingApps, setLoadingApps] = useState(false);
    const [checkingDevice, setCheckingDevice] = useState(false);
    const androidAppsRequestId = useRef(0);
    const validateTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const deviceId = androidDeviceId(form);

    useEffect(() => {
        if (isNew) {
            return;
        }
        api.getTask(Number(id))
            .then((task) => {
                setName(task.name);
                setYamlText(task.yaml);
                const loadedForm = applyLoadedTaskYaml(task.yaml);
                if (loadedForm.form) {
                    setForm(loadedForm.form);
                }
                setMode(loadedForm.mode);
                setYamlLocked(loadedForm.yamlLocked);
                setLoaded(true);
            })
            .catch((error: Error) => message.error(error.message));
    }, [id]);

    const loadAndroidDevices = async () => {
        setLoadingDevices(true);
        try {
            const result = await api.listAndroidDevices();
            setAndroidDevices(result.devices);
            setForm((prev) => withDefaultAndroidDevice(prev, firstDeviceId(result.devices)));
        } catch (error) {
            message.error(errorText(error));
        } finally {
            setLoadingDevices(false);
        }
    };

    useEffect(() => {
        if (form.target.type === 'android') {
            void loadAndroidDevices();
        }
    }, [form.target.type]);

    const applyIfCurrent = (requestId: number, action: () => void) => {
        if (requestId !== androidAppsRequestId.current) {
            return;
        }
        action();
    };

    const loadAndroidApps = async (id: string) => {
        const requestId = androidAppsRequestId.current + 1;
        androidAppsRequestId.current = requestId;
        setAndroidApps([]);
        setLoadingApps(true);
        try {
            const result = await api.listAndroidApps(id);
            applyIfCurrent(requestId, () => setAndroidApps(result.apps));
        } catch (error) {
            applyIfCurrent(requestId, () => {
                setAndroidApps([]);
                message.error(errorText(error));
            });
        } finally {
            applyIfCurrent(requestId, () => setLoadingApps(false));
        }
    };

    useEffect(() => {
        if (!deviceId) {
            androidAppsRequestId.current += 1;
            setAndroidApps([]);
            setLoadingApps(false);
            return;
        }
        void loadAndroidApps(deviceId);
    }, [deviceId]);

    const currentYaml = currentYamlText({ mode, form, yamlText });

    // 编辑停顿后自动调后端校验（含变量检查）
    useEffect(() => {
        if (!loaded) {
            return;
        }
        clearTimeout(validateTimer.current);
        validateTimer.current = setTimeout(() => {
            api.validateYaml(currentYaml)
                .then((result) => {
                    setErrors(result.errors);
                    setValidated(true);
                })
                .catch(() => {
                    setErrors([]);
                    setValidated(true);
                });
        }, VALIDATE_DEBOUNCE_MS);
        return () => clearTimeout(validateTimer.current);
    }, [currentYaml, loaded]);

    const switchMode = (next: string | number) => {
        const result = editorModeSwitch({ current: mode, next, form, yamlText });
        applyEditorMode(result);
    };

    const applyEditorMode = (result: ReturnType<typeof editorModeSwitch>) => {
        if (result.type === 'noop') {
            return;
        }
        applyEditorModeChange(result);
    };

    const applyEditorModeChange = (
        result: Exclude<ReturnType<typeof editorModeSwitch>, { type: 'noop' }>,
    ) => {
        if (result.type === 'yaml') {
            setYamlText(result.yamlText);
            setMode('yaml');
            return;
        }
        applyFormMode(result);
    };

    const applyFormMode = (
        result: Extract<
            ReturnType<typeof editorModeSwitch>,
            { type: 'form' } | { type: 'blocked' }
        >,
    ) => {
        if (result.type === 'blocked') {
            message.warning('当前 YAML 包含表单不支持的内容，无法切换；请先在 YAML 里修正');
            return;
        }
        setForm(result.form);
        setMode('form');
        setYamlLocked(false);
    };

    const updateTask = (index: number, patch: Partial<FormTask>) => {
        setForm((prev) => ({
            ...prev,
            tasks: prev.tasks.map((task, i) => (i === index ? { ...task, ...patch } : task)),
        }));
    };

    const updateStep = (taskIndex: number, stepIndex: number, patch: Partial<FormStep>) => {
        const task = form.tasks[taskIndex];
        updateTask(taskIndex, {
            steps: task.steps.map((step, i) => (i === stepIndex ? { ...step, ...patch } : step)),
        });
    };

    const persistValidatedTask = async () => {
        const result = await api.validateYaml(currentYaml);
        const validateError = yamlValidateError(result);
        if (validateError) {
            setErrors(result.errors);
            message.error(validateError);
            return;
        }
        await writeTask();
        message.success('已保存');
        navigate('/tasks');
    };

    const persistTask = async () => {
        try {
            await persistValidatedTask();
        } catch (error) {
            message.error(errorText(error));
        } finally {
            setSaving(false);
        }
    };

    const writeTask = async () => {
        if (isNew) {
            await api.createTask({ name: name.trim(), yaml: currentYaml });
            return;
        }
        await api.updateTask(Number(id), {
            name: name.trim(),
            yaml: currentYaml,
        });
    };

    const save = async () => {
        const nameError = taskNameError(name);
        if (nameError) {
            message.warning(nameError);
            return;
        }
        setSaving(true);
        await persistTask();
    };

    const renderStepFields = (taskIndex: number, stepIndex: number, step: FormStep) => {
        const option = ACTION_OPTIONS.find((item) => item.action === step.action);
        if (!option) {
            return null;
        }
        return option.fields.map((field) => (
            <StepField
                key={field.key}
                field={field}
                step={step}
                value={step.params[field.key]}
                targetType={form.target.type}
                androidApps={androidApps}
                loadingApps={loadingApps}
                deviceId={deviceId}
                onChange={(next) =>
                    updateStep(taskIndex, stepIndex, {
                        params: { ...step.params, [field.key]: next },
                    })
                }
                onReloadApps={() => void loadAndroidApps(deviceId)}
            />
        ));
    };

    const showAndroidCheckMessage = (result: {
        ok: boolean;
        device?: { name: string };
        message?: string;
    }) => {
        if (result.ok) {
            message.success(`设备 ${result.device?.name} 连接正常`);
            return;
        }
        message.error(result.message);
    };

    const reportAndroidDevice = async () => {
        try {
            showAndroidCheckMessage(await api.checkAndroidDevice(deviceId));
        } catch (error) {
            message.error(errorText(error));
        } finally {
            setCheckingDevice(false);
        }
    };

    const checkSelectedAndroidDevice = async () => {
        if (!canCheckAndroidDevice(form)) {
            return;
        }
        setCheckingDevice(true);
        await reportAndroidDevice();
    };

    const renderFormEditor = () => (
        <Space orientation='vertical' size='middle' style={{ width: '100%' }}>
            <Flex gap={12} wrap='wrap' align='center'>
                <Typography.Text strong>运行目标</Typography.Text>
                <Segmented
                    value={form.target.type}
                    options={[
                        { label: '网页', value: 'web' },
                        { label: 'Android', value: 'android' },
                    ]}
                    onChange={(value) => {
                        setForm((prev) =>
                            formWithTargetType(prev, value === 'android' ? 'android' : 'web'),
                        );
                    }}
                />
            </Flex>

            <TargetEditor
                form={form}
                androidDevices={androidDevices}
                loadingDevices={loadingDevices}
                checkingDevice={checkingDevice}
                onFormChange={setForm}
                onReloadDevices={() => void loadAndroidDevices()}
                onCheckDevice={() => void checkSelectedAndroidDevice()}
            />

            <SortableList
                ids={form.tasks.map((task) => task.id)}
                onReorder={(activeId, overId) =>
                    setForm((prev) => ({
                        ...prev,
                        tasks: reorderById(prev.tasks, activeId, overId),
                    }))
                }
            >
                {form.tasks.map((task, taskIndex) => (
                    <SortableTaskCard
                        key={task.id}
                        id={task.id}
                        index={taskIndex}
                        name={task.name}
                        canDelete={form.tasks.length > 1}
                        onNameChange={(taskName) => updateTask(taskIndex, { name: taskName })}
                        onDelete={() =>
                            setForm((prev) => ({
                                ...prev,
                                tasks: prev.tasks.filter(
                                    (currentTask) => currentTask.id !== task.id,
                                ),
                            }))
                        }
                    >
                        <Flex vertical gap={8}>
                            <TaskGroupUrl
                                targetType={form.target.type}
                                url={task.url}
                                onChange={(url) => updateTask(taskIndex, { url })}
                            />
                            <SortableList
                                ids={task.steps.map((step) => step.id)}
                                onReorder={(activeId, overId) =>
                                    updateTask(taskIndex, {
                                        steps: reorderById(task.steps, activeId, overId),
                                    })
                                }
                            >
                                {task.steps.map((step, stepIndex) => (
                                    <SortableStepRow key={step.id} id={step.id} index={stepIndex}>
                                        <Select
                                            style={{ width: 110 }}
                                            value={step.action}
                                            options={actionOptionsForTarget(form.target.type).map(
                                                (option) => ({
                                                    label: option.label,
                                                    value: option.action,
                                                }),
                                            )}
                                            onChange={(action) => {
                                                const next = createEmptyStep(action);
                                                updateStep(taskIndex, stepIndex, {
                                                    ...next,
                                                    id: step.id,
                                                    name: step.name,
                                                });
                                            }}
                                        />
                                        {renderStepFields(taskIndex, stepIndex, step)}
                                        <Input
                                            style={{ width: 110 }}
                                            placeholder='步骤名(可选)'
                                            value={step.name ?? ''}
                                            onChange={(e) =>
                                                updateStep(taskIndex, stepIndex, {
                                                    name: e.target.value,
                                                })
                                            }
                                        />
                                        <Button
                                            size='small'
                                            danger
                                            icon={<DeleteOutlined />}
                                            disabled={task.steps.length === 1}
                                            onClick={() =>
                                                updateTask(taskIndex, {
                                                    steps: task.steps.filter(
                                                        (_, i) => i !== stepIndex,
                                                    ),
                                                })
                                            }
                                        />
                                    </SortableStepRow>
                                ))}
                            </SortableList>
                            <Button
                                type='dashed'
                                icon={<PlusOutlined />}
                                onClick={() =>
                                    updateTask(taskIndex, {
                                        steps: [...task.steps, createEmptyStep('aiTap')],
                                    })
                                }
                            >
                                添加步骤
                            </Button>
                        </Flex>
                    </SortableTaskCard>
                ))}
            </SortableList>

            <Button
                type='dashed'
                block
                icon={<PlusOutlined />}
                onClick={() =>
                    setForm((prev) => ({
                        ...prev,
                        tasks: [...prev.tasks, createEmptyTask(prev.tasks.length + 1)],
                    }))
                }
            >
                添加步骤组
            </Button>
        </Space>
    );

    const renderYamlEditor = () => (
        <>
            <YamlLockedAlert yamlLocked={yamlLocked} />
            <Typography.Paragraph type='secondary'>
                支持动作：ai / aiTap / aiHover / aiRightClick / aiInput / aiAssert / aiWaitFor /
                aiQuery / aiKeyboardPress / aiScroll / sleep；步骤组可加 <code>url</code>{' '}
                切换页面，相同地址会复用已打开的页面；变量用 {'{{变量名}}'}{' '}
                引用，在「设置-变量」中配置。
            </Typography.Paragraph>
            <CodeMirror
                value={yamlText}
                height='420px'
                theme={themeMode}
                extensions={[yaml()]}
                onChange={setYamlText}
                basicSetup={{ lineNumbers: true, foldGutter: true }}
            />
        </>
    );

    const banner = scriptValidationBanner({ validated, errors });

    return (
        <Card
            title={taskEditTitle(isNew)}
            styles={{ header: CARD_HEADER_WRAP_STYLE }}
            extra={
                <Space style={CARD_ACTIONS_STYLE}>
                    <Segmented
                        value={mode}
                        onChange={switchMode}
                        options={[
                            { label: '表单编辑', value: 'form' },
                            { label: 'YAML 编辑', value: 'yaml' },
                        ]}
                    />
                    <Button onClick={() => navigate('/tasks')}>返回</Button>
                    <Button type='primary' loading={saving} onClick={save}>
                        保存
                    </Button>
                </Space>
            }
        >
            <Space orientation='vertical' size='middle' style={{ width: '100%' }}>
                <div>
                    <Typography.Text strong>任务名</Typography.Text>
                    <Input
                        style={{ marginTop: 8 }}
                        placeholder='例如：登录冒烟测试'
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                </div>
                <ModeEditor
                    mode={mode}
                    formEditor={renderFormEditor()}
                    yamlEditor={renderYamlEditor()}
                />
                <BannerPending banner={banner} />
                <BannerError banner={banner} errors={errors} />
                <BannerSuccess banner={banner} />
            </Space>
        </Card>
    );
}
