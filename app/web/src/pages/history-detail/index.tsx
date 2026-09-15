import { useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import type { RunRecord, RunStepRecord } from '@lookrun/shared';
import { RunStatusTag, formatDuration, formatTime } from '@/components';
import { CopyText } from '@/components/copy-text';
import { LoadingBlock } from '@/components/loading-block';
import { notify } from '@/components/notify';
import { PageCard } from '@/components/page-card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { api, screenshotUrl } from './api';
import { OptionalBlock } from './components/OptionalBlock';
import { StepStatus } from './components/StepStatus';
import { TokenText } from './components/TokenText';
import { hasTokenUsage } from './utils';

export default function RunDetailPage() {
    const { id } = useParams();
    const [run, setRun] = useState<RunRecord | null>(null);
    const [steps, setSteps] = useState<RunStepRecord[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.runDetail(Number(id))
            .then((detail) => {
                setRun(detail.run);
                setSteps(detail.steps);
            })
            .catch((error: Error) => notify.error(error.message))
            .finally(() => setLoading(false));
    }, [id]);

    if (loading) {
        return <LoadingBlock className='py-20' />;
    }
    return <RunDetailBody run={run} steps={steps} />;
}

function RunDetailBody({ run, steps }: { run: RunRecord | null; steps: RunStepRecord[] }) {
    if (!run) {
        return <PageCard>运行记录不存在</PageCard>;
    }

    return (
        <div className='flex flex-col gap-4'>
            <PageCard title={`运行详情 #${run.id} · ${run.taskName}`}>
                <dl className='grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-4'>
                    <Info label='状态'>
                        <RunStatusTag status={run.status} />
                    </Info>
                    <Info label='模型'>{run.model}</Info>
                    <Info label='开始时间'>{formatTime(run.startedAt)}</Info>
                    <Info label='耗时'>{formatDuration(run.durationMs)}</Info>
                    <Info label='Token（输入/输出）'>
                        <TokenText input={run.tokenInput} output={run.tokenOutput} />
                    </Info>
                    <Info label='结束时间'>{formatTime(run.finishedAt)}</Info>
                </dl>
                <OptionalBlock show={Boolean(run.error)}>
                    <p className='mt-3 mb-0 text-destructive'>{run.error}</p>
                </OptionalBlock>
            </PageCard>
            {steps.map((step) => (
                <StepHistoryCard key={step.id} step={step} />
            ))}
        </div>
    );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className='flex flex-col gap-1'>
            <dt className='text-muted-foreground'>{label}</dt>
            <dd>{children}</dd>
        </div>
    );
}

function screenshotSrc(path: string | null) {
    if (!path) {
        return screenshotUrl('');
    }
    return screenshotUrl(path);
}

function copyableText(value: string | null) {
    if (!value) {
        return undefined;
    }
    return value;
}

function aiResultText(raw: string | null) {
    if (!raw) {
        return '';
    }
    return raw;
}

function StepHistoryCard({ step }: { step: RunStepRecord }) {
    return (
        <PageCard
            title={
                <span className='inline-flex flex-wrap items-center gap-2'>
                    <Badge variant='outline'>{`#${step.stepIndex + 1}`}</Badge>
                    <span>{step.stepName}</span>
                    <Badge>{step.action}</Badge>
                    <StepStatus status={step.status} />
                </span>
            }
            extra={
                <span className='text-sm text-muted-foreground'>
                    {formatDuration(step.durationMs)}
                    <OptionalBlock show={hasTokenUsage(step.tokenInput, step.tokenOutput)}>
                        {` · Token ${step.tokenInput}/${step.tokenOutput}`}
                    </OptionalBlock>
                </span>
            }
        >
            <div className='grid gap-4 lg:grid-cols-[7fr_5fr]'>
                <div className='flex flex-col gap-2'>
                    <OptionalBlock show={Boolean(step.url)}>
                        <div>
                            <span className='font-medium'>当时 URL：</span>
                            <CopyText text={copyableText(step.url) ?? ''}>{step.url}</CopyText>
                        </div>
                    </OptionalBlock>
                    <OptionalBlock show={Boolean(step.prompt)}>
                        <div>
                            <span className='font-medium'>目标：</span>
                            <span>{step.prompt}</span>
                        </div>
                    </OptionalBlock>
                    <OptionalBlock show={Boolean(step.aiResult)}>
                        <div>
                            <span className='font-medium'>AI 识别：</span>
                            <pre className='my-1 rounded-md bg-muted p-2 whitespace-pre-wrap'>
                                {formatAiResult(aiResultText(step.aiResult))}
                            </pre>
                        </div>
                    </OptionalBlock>
                    <OptionalBlock show={Boolean(step.error)}>
                        <div>
                            <span className='font-medium'>失败原因：</span>
                            <span className='text-destructive'>{step.error}</span>
                        </div>
                    </OptionalBlock>
                </div>
                <div className='flex gap-3'>
                    <OptionalBlock show={Boolean(step.shotBefore)}>
                        <ShotPreview
                            src={screenshotSrc(step.shotBefore)}
                            alt='执行前截图'
                            label='执行前'
                        />
                    </OptionalBlock>
                    <OptionalBlock show={Boolean(step.shotAfter)}>
                        <ShotPreview
                            src={screenshotSrc(step.shotAfter)}
                            alt='执行后截图'
                            label='执行后'
                        />
                    </OptionalBlock>
                </div>
            </div>
        </PageCard>
    );
}

function ShotPreview({ src, alt, label }: { src: string; alt: string; label: string }) {
    const [open, setOpen] = useState(false);
    return (
        <div className='flex-1'>
            <p className='mb-1 text-xs text-muted-foreground'>{label}</p>
            <button type='button' className='cursor-pointer' onClick={() => setOpen(true)}>
                <img src={src} alt={alt} className='w-full rounded-md border' />
            </button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className='max-w-4xl'>
                    <DialogTitle>{label}</DialogTitle>
                    <img src={src} alt={alt} className='w-full' />
                </DialogContent>
            </Dialog>
        </div>
    );
}

function formatAiResult(raw: string) {
    try {
        return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
        return raw;
    }
}
