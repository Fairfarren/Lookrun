import {
    App as AntApp,
    Card,
    Col,
    Descriptions,
    Image,
    Row,
    Space,
    Spin,
    Tag,
    theme,
    Typography,
} from 'antd';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { RunRecord, RunStepRecord } from '@lookrun/shared';
import { api, screenshotUrl } from '../api';
import { RunStatusTag, formatDuration, formatTime } from '../components';
import { hasTokenUsage, stepStatusTag, tokenPairText } from '../utils/run-detail';

function TokenText({ input, output }: { input: number; output: number }) {
    return <>{tokenPairText(input, output)}</>;
}

function StepStatus({ status }: { status: string }) {
    const tag = stepStatusTag(status);
    return <Tag color={tag.color}>{tag.text}</Tag>;
}

function OptionalBlock({ show, children }: { show: boolean; children: React.ReactNode }) {
    if (!show) {
        return null;
    }
    return children;
}

export default function RunDetailPage() {
    const { id } = useParams();
    const { message } = AntApp.useApp();
    const { token } = theme.useToken();
    const [run, setRun] = useState<RunRecord | null>(null);
    const [steps, setSteps] = useState<RunStepRecord[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.runDetail(Number(id))
            .then((detail) => {
                setRun(detail.run);
                setSteps(detail.steps);
            })
            .catch((error: Error) => message.error(error.message))
            .finally(() => setLoading(false));
    }, [id]);

    if (loading) {
        return <Spin style={{ display: 'block', margin: '80px auto' }} />;
    }
    return <RunDetailBody run={run} steps={steps} token={token} />;
}

function RunDetailBody({
    run,
    steps,
    token,
}: {
    run: RunRecord | null;
    steps: RunStepRecord[];
    token: { colorFillSecondary: string };
}) {
    if (!run) {
        return <Card>运行记录不存在</Card>;
    }

    return (
        <Space orientation='vertical' size='middle' style={{ width: '100%' }}>
            <Card title={`运行详情 #${run.id} · ${run.taskName}`}>
                <Descriptions column={4}>
                    <Descriptions.Item label='状态'>
                        <RunStatusTag status={run.status} />
                    </Descriptions.Item>
                    <Descriptions.Item label='模型'>{run.model}</Descriptions.Item>
                    <Descriptions.Item label='开始时间'>
                        {formatTime(run.startedAt)}
                    </Descriptions.Item>
                    <Descriptions.Item label='耗时'>
                        {formatDuration(run.durationMs)}
                    </Descriptions.Item>
                    <Descriptions.Item label='Token（输入/输出）'>
                        <TokenText input={run.tokenInput} output={run.tokenOutput} />
                    </Descriptions.Item>
                    <Descriptions.Item label='结束时间'>
                        {formatTime(run.finishedAt)}
                    </Descriptions.Item>
                </Descriptions>
                <OptionalBlock show={Boolean(run.error)}>
                    <Typography.Paragraph type='danger' style={{ marginTop: 12, marginBottom: 0 }}>
                        {run.error}
                    </Typography.Paragraph>
                </OptionalBlock>
            </Card>

            {steps.map((step) => (
                <StepHistoryCard key={step.id} step={step} fill={token.colorFillSecondary} />
            ))}
        </Space>
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

function StepHistoryCard({ step, fill }: { step: RunStepRecord; fill: string }) {
    return (
        <Card
            size='small'
            title={
                <Space>
                    <Tag>{`#${step.stepIndex + 1}`}</Tag>
                    <span>{step.stepName}</span>
                    <Tag color='blue'>{step.action}</Tag>
                    <StepStatus status={step.status} />
                </Space>
            }
            extra={
                <Space split='·'>
                    <Typography.Text type='secondary'>
                        {formatDuration(step.durationMs)}
                    </Typography.Text>
                    <OptionalBlock show={hasTokenUsage(step.tokenInput, step.tokenOutput)}>
                        <Typography.Text type='secondary'>
                            Token {step.tokenInput}/{step.tokenOutput}
                        </Typography.Text>
                    </OptionalBlock>
                </Space>
            }
        >
            <Row gutter={16}>
                <Col span={14}>
                    <Space orientation='vertical' size={8} style={{ width: '100%' }}>
                        <OptionalBlock show={Boolean(step.url)}>
                            <div>
                                <Typography.Text strong>当时 URL：</Typography.Text>
                                <Typography.Text copyable={{ text: copyableText(step.url) }}>
                                    {step.url}
                                </Typography.Text>
                            </div>
                        </OptionalBlock>
                        <OptionalBlock show={Boolean(step.prompt)}>
                            <div>
                                <Typography.Text strong>目标：</Typography.Text>
                                <Typography.Text>{step.prompt}</Typography.Text>
                            </div>
                        </OptionalBlock>
                        <OptionalBlock show={Boolean(step.aiResult)}>
                            <div>
                                <Typography.Text strong>AI 识别：</Typography.Text>
                                <pre
                                    style={{
                                        background: fill,
                                        padding: 8,
                                        borderRadius: 4,
                                        margin: '4px 0',
                                        whiteSpace: 'pre-wrap',
                                    }}
                                >
                                    {formatAiResult(aiResultText(step.aiResult))}
                                </pre>
                            </div>
                        </OptionalBlock>
                        <OptionalBlock show={Boolean(step.error)}>
                            <div>
                                <Typography.Text strong>失败原因：</Typography.Text>
                                <Typography.Text type='danger'>{step.error}</Typography.Text>
                            </div>
                        </OptionalBlock>
                    </Space>
                </Col>
                <Col span={10}>
                    <Image.PreviewGroup>
                        <Space>
                            <OptionalBlock show={Boolean(step.shotBefore)}>
                                <div>
                                    <Typography.Text type='secondary' style={{ fontSize: 12 }}>
                                        执行前
                                    </Typography.Text>
                                    <Image
                                        width='100%'
                                        src={screenshotSrc(step.shotBefore)}
                                        alt='执行前截图'
                                    />
                                </div>
                            </OptionalBlock>
                            <OptionalBlock show={Boolean(step.shotAfter)}>
                                <div>
                                    <Typography.Text type='secondary' style={{ fontSize: 12 }}>
                                        执行后
                                    </Typography.Text>
                                    <Image
                                        width='100%'
                                        src={screenshotSrc(step.shotAfter)}
                                        alt='执行后截图'
                                    />
                                </div>
                            </OptionalBlock>
                        </Space>
                    </Image.PreviewGroup>
                </Col>
            </Row>
        </Card>
    );
}

function formatAiResult(raw: string) {
    try {
        return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
        return raw;
    }
}
