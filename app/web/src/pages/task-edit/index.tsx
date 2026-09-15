import { yaml } from '@codemirror/lang-yaml';
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
import { GripVertical, Plus, RefreshCw, Trash2 } from 'lucide-react';
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
import { BusyButton } from '@/components/busy-button';
import { notify } from '@/components/notify';
import { NumberInput } from '@/components/number-input';
import { PageCard } from '@/components/page-card';
import { SelectField } from '@/components/select-field';
import { SuggestInput } from '@/components/suggest-input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { CARD_ACTIONS_CLASS, CARD_HEADER_WRAP_CLASS } from '@/styles/layout';
import { useThemeMode } from '@/theme/context';
import { createAndroidAppOptions } from './android-app-options';
import { api } from './api';
import { reorderById } from '@/utils/sortable-items';
import { draggingItemStyle } from '@/utils/sortable-style';
import { errorText } from '@/utils/error-text';
import { androidCheckError, fieldLabelText, launchFieldPlaceholder } from '@/utils/ui-class';
import { scriptValidationBanner } from './script-validation';
import { createValidationErrorKey } from './validation-errors';
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
} from './task-form';

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
            className='gap-3 py-3'
            style={{
                transform: CSS.Transform.toString(transform),
                transition,
                opacity: draggingItemStyle(isDragging).opacity,
                position: 'relative',
                zIndex: draggingItemStyle(isDragging).zIndex,
            }}
        >
            <CardHeader className='px-4'>
                <div className='flex flex-wrap items-center gap-2'>
                    <Button
                        ref={setActivatorNodeRef}
                        type='button'
                        variant='ghost'
                        size='icon-sm'
                        aria-label={`拖拽第 ${index + 1} 个步骤组进行排序`}
                        title='拖拽排序'
                        style={{
                            cursor: draggingItemStyle(isDragging).cursor,
                            touchAction: 'none',
                        }}
                        {...attributes}
                        {...listeners}
                    >
                        <GripVertical />
                    </Button>
                    <span className='text-muted-foreground'>{`${index + 1}.`}</span>
                    <Input
                        className='max-w-[320px]'
                        placeholder='步骤组名称，如：登录'
                        value={name}
                        onChange={(event) => onNameChange(event.target.value)}
                    />
                </div>
                <CardAction>
                    <Button
                        size='icon-sm'
                        variant='destructive'
                        disabled={!canDelete}
                        aria-label='删除步骤组'
                        onClick={onDelete}
                    >
                        <Trash2 />
                    </Button>
                </CardAction>
            </CardHeader>
            <CardContent className='px-4'>{children}</CardContent>
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
        <div
            ref={setNodeRef}
            className='flex flex-wrap items-center gap-2'
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
                type='button'
                variant='ghost'
                size='icon-sm'
                aria-label={`拖拽第 ${index + 1} 个步骤进行排序`}
                title='拖拽排序'
                style={{ cursor: draggingItemStyle(isDragging).cursor, touchAction: 'none' }}
                {...attributes}
                {...listeners}
            >
                <GripVertical />
            </Button>
            <span className='w-6 text-muted-foreground'>{index + 1}.</span>
            {children}
        </div>
    );
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
        <SelectField
            key={input.field.key}
            className='w-[110px]'
            value={fieldSelectValue(input.value)}
            options={input.field.options ?? []}
            onValueChange={input.onChange}
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
        <div key={input.field.key} className='flex min-w-[280px] flex-1 gap-2'>
            <SuggestInput
                className='flex-1'
                value={fieldStringValue(input.value)}
                options={createAndroidAppOptions(input.androidApps)}
                placeholder={launchFieldPlaceholder(
                    input.loadingApps,
                    fieldLabelText(input.field.placeholder, input.field.label),
                    appsNotFoundContent(true),
                )}
                onValueChange={input.onChange}
            />
            <BusyButton
                variant='outline'
                size='icon'
                busy={input.loadingApps}
                disabled={!input.deviceId}
                title='刷新应用列表'
                onClick={input.onReloadApps}
            >
                <RefreshCw />
            </BusyButton>
        </div>
    );
}

function NumberStepField(input: {
    field: { key: string; placeholder?: string; label: string };
    value: unknown;
    onChange: (next: string | number | undefined) => void;
}) {
    return (
        <NumberInput
            key={input.field.key}
            className='w-[130px]'
            min={1}
            placeholder={input.field.placeholder ?? input.field.label}
            value={fieldNumberValue(input.value)}
            onValueChange={input.onChange}
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
            className='min-w-[140px] flex-1'
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
            <div className='flex flex-wrap items-center gap-3'>
                <span className='font-medium'>起始页面</span>
                <Input
                    className='min-w-[260px] flex-1'
                    placeholder='起始页面地址，如 https://h5.example.com'
                    value={target.url}
                    onChange={(event) =>
                        input.onFormChange(withWebUrl(input.form, event.target.value))
                    }
                />
                <NumberInput
                    className='w-[160px]'
                    placeholder='视口宽(默认390)'
                    min={320}
                    value={target.viewportWidth}
                    onValueChange={(value) =>
                        input.onFormChange(withWebViewportWidth(input.form, value))
                    }
                />
                <NumberInput
                    className='w-[160px]'
                    placeholder='视口高(默认844)'
                    min={320}
                    value={target.viewportHeight}
                    onValueChange={(value) =>
                        input.onFormChange(withWebViewportHeight(input.form, value))
                    }
                />
            </div>
            <p className='text-sm text-muted-foreground'>
                每个步骤组可另填页面地址。相同地址会回到已打开的页面，不会新开，适合 H5
                发验证码后再去后台接码。
            </p>
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
        <div className='flex flex-wrap items-center gap-3'>
            <span className='font-medium'>设备号</span>
            <SelectField
                className='min-w-[320px] flex-1'
                placeholder='选择已连接并授权的 Android 设备'
                value={optionalDeviceId(input.form.target.deviceId)}
                options={input.androidDevices.map((device) => ({
                    label: `${device.name}（${device.id}）`,
                    value: device.id,
                }))}
                onValueChange={(deviceId) =>
                    input.onFormChange({
                        ...input.form,
                        target: { type: 'android', deviceId },
                    })
                }
            />
            <BusyButton
                variant='outline'
                busy={input.loadingDevices}
                onClick={input.onReloadDevices}
            >
                <RefreshCw />
                刷新设备
            </BusyButton>
            <BusyButton
                variant='outline'
                busy={input.checkingDevice}
                disabled={!input.form.target.deviceId}
                onClick={input.onCheckDevice}
            >
                检查连接
            </BusyButton>
        </div>
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
        <Alert variant='warning' className='mb-3'>
            <AlertTitle>
                此脚本包含表单编辑器不支持的内容（如高级参数），已用 YAML 模式编辑
            </AlertTitle>
        </Alert>
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
    return (
        <Alert data-testid='script-validation-banner' variant='info'>
            <AlertTitle>正在校验</AlertTitle>
        </Alert>
    );
}

function BannerError({ banner, errors }: { banner: string; errors: string[] }) {
    if (banner !== 'error') {
        return null;
    }
    return (
        <Alert data-testid='script-validation-banner' variant='destructive'>
            <AlertTitle>脚本存在问题</AlertTitle>
            <AlertDescription>
                <ul className='m-0 ps-5'>
                    {errors.map((error, errorIndex) => (
                        <li key={createValidationErrorKey(error, errorIndex)}>{error}</li>
                    ))}
                </ul>
            </AlertDescription>
        </Alert>
    );
}

function BannerSuccess({ banner }: { banner: string }) {
    if (banner !== 'success') {
        return null;
    }
    return (
        <Alert data-testid='script-validation-banner' variant='success'>
            <AlertTitle>校验通过</AlertTitle>
        </Alert>
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
            .catch((error: Error) => notify.error(error.message));
    }, [id]);

    const loadAndroidDevices = async () => {
        setLoadingDevices(true);
        try {
            const result = await api.listAndroidDevices();
            setAndroidDevices(result.devices);
            setForm((prev) => withDefaultAndroidDevice(prev, firstDeviceId(result.devices)));
        } catch (error) {
            notify.error(errorText(error));
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
                notify.error(errorText(error));
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
            notify.warning('当前 YAML 包含表单不支持的内容，无法切换；请先在 YAML 里修正');
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
            notify.error(validateError);
            return;
        }
        await writeTask();
        notify.success('已保存');
        navigate('/tasks');
    };

    const persistTask = async () => {
        try {
            await persistValidatedTask();
        } catch (error) {
            notify.error(errorText(error));
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
            notify.warning(nameError);
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
            notify.success(`设备 ${result.device?.name} 连接正常`);
            return;
        }
        notify.error(androidCheckError(result.message));
    };

    const reportAndroidDevice = async () => {
        try {
            showAndroidCheckMessage(await api.checkAndroidDevice(deviceId));
        } catch (error) {
            notify.error(errorText(error));
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
        <div className='flex flex-col gap-4'>
            <div className='flex flex-wrap items-center gap-3'>
                <span className='font-medium'>运行目标</span>
                <ToggleGroup
                    type='single'
                    variant='outline'
                    value={form.target.type}
                    onValueChange={(value) => {
                        if (!value) {
                            return;
                        }
                        setForm((prev) =>
                            formWithTargetType(prev, value === 'android' ? 'android' : 'web'),
                        );
                    }}
                >
                    <ToggleGroupItem value='web'>网页</ToggleGroupItem>
                    <ToggleGroupItem value='android'>Android</ToggleGroupItem>
                </ToggleGroup>
            </div>

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
                        <div className='flex flex-col gap-2'>
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
                                        <SelectField
                                            className='w-[110px]'
                                            value={step.action}
                                            options={actionOptionsForTarget(form.target.type).map(
                                                (option) => ({
                                                    label: option.label,
                                                    value: option.action,
                                                }),
                                            )}
                                            onValueChange={(action) => {
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
                                            className='w-[110px]'
                                            placeholder='步骤名(可选)'
                                            value={step.name ?? ''}
                                            onChange={(e) =>
                                                updateStep(taskIndex, stepIndex, {
                                                    name: e.target.value,
                                                })
                                            }
                                        />
                                        <Button
                                            size='icon-sm'
                                            variant='destructive'
                                            disabled={task.steps.length === 1}
                                            aria-label='删除步骤'
                                            onClick={() =>
                                                updateTask(taskIndex, {
                                                    steps: task.steps.filter(
                                                        (_, i) => i !== stepIndex,
                                                    ),
                                                })
                                            }
                                        >
                                            <Trash2 />
                                        </Button>
                                    </SortableStepRow>
                                ))}
                            </SortableList>
                            <Button
                                variant='outline'
                                className='border-dashed'
                                onClick={() =>
                                    updateTask(taskIndex, {
                                        steps: [...task.steps, createEmptyStep('aiTap')],
                                    })
                                }
                            >
                                <Plus />
                                添加步骤
                            </Button>
                        </div>
                    </SortableTaskCard>
                ))}
            </SortableList>

            <Button
                variant='outline'
                className='w-full border-dashed'
                onClick={() =>
                    setForm((prev) => ({
                        ...prev,
                        tasks: [...prev.tasks, createEmptyTask(prev.tasks.length + 1)],
                    }))
                }
            >
                <Plus />
                添加步骤组
            </Button>
        </div>
    );

    const renderYamlEditor = () => (
        <>
            <YamlLockedAlert yamlLocked={yamlLocked} />
            <p className='mb-3 text-sm text-muted-foreground'>
                支持动作：ai / aiTap / aiHover / aiRightClick / aiInput / aiAssert / aiWaitFor /
                aiQuery / aiKeyboardPress / aiScroll / sleep；步骤组可加 <code>url</code>{' '}
                切换页面，相同地址会复用已打开的页面；变量用 {'{{变量名}}'}{' '}
                引用，在「设置-变量」中配置。
            </p>
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
        <PageCard
            title={
                <div className={CARD_HEADER_WRAP_CLASS}>
                    <span>{taskEditTitle(isNew)}</span>
                </div>
            }
            extra={
                <div className={CARD_ACTIONS_CLASS}>
                    <ToggleGroup
                        type='single'
                        variant='outline'
                        value={mode}
                        onValueChange={(value) => {
                            if (value) {
                                switchMode(value);
                            }
                        }}
                    >
                        <ToggleGroupItem value='form'>表单编辑</ToggleGroupItem>
                        <ToggleGroupItem value='yaml'>YAML 编辑</ToggleGroupItem>
                    </ToggleGroup>
                    <Button variant='outline' onClick={() => navigate('/tasks')}>
                        返回
                    </Button>
                    <BusyButton busy={saving} onClick={() => void save()}>
                        保存
                    </BusyButton>
                </div>
            }
        >
            <div className='flex flex-col gap-4'>
                <div>
                    <div className='font-medium'>任务名</div>
                    <Input
                        className='mt-2'
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
            </div>
        </PageCard>
    );
}
