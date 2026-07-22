import { App as AntApp, Card, Col, Descriptions, Image, Row, Space, Spin, Tag, theme, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { RunRecord, RunStepRecord } from '../../../shared/types';
import { api, screenshotUrl } from '../api';
import { RunStatusTag, formatDuration, formatTime } from '../components';

export default function RunDetailPage() {
  const { id } = useParams();
  const { message } = AntApp.useApp();
  const { token } = theme.useToken();
  const [run, setRun] = useState<RunRecord | null>(null);
  const [steps, setSteps] = useState<RunStepRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .runDetail(Number(id))
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
  if (!run) {
    return <Card>运行记录不存在</Card>;
  }

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Card title={`运行详情 #${run.id} · ${run.taskName}`}>
        <Descriptions column={4}>
          <Descriptions.Item label="状态">
            <RunStatusTag status={run.status} />
          </Descriptions.Item>
          <Descriptions.Item label="模型">{run.model}</Descriptions.Item>
          <Descriptions.Item label="开始时间">{formatTime(run.startedAt)}</Descriptions.Item>
          <Descriptions.Item label="耗时">{formatDuration(run.durationMs)}</Descriptions.Item>
          <Descriptions.Item label="Token（输入/输出）">
            {run.tokenInput + run.tokenOutput > 0 ? `${run.tokenInput} / ${run.tokenOutput}` : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="结束时间">{formatTime(run.finishedAt)}</Descriptions.Item>
        </Descriptions>
        {run.error && (
          <Typography.Paragraph type="danger" style={{ marginTop: 12, marginBottom: 0 }}>
            {run.error}
          </Typography.Paragraph>
        )}
      </Card>

      {steps.map((step) => (
        <Card
          key={step.id}
          size="small"
          title={
            <Space>
              <Tag>{`#${step.stepIndex + 1}`}</Tag>
              <span>{step.stepName}</span>
              <Tag color="blue">{step.action}</Tag>
              {step.status === 'success' ? <Tag color="success">成功</Tag> : <Tag color="error">失败</Tag>}
            </Space>
          }
          extra={
            <Space split="·">
              <Typography.Text type="secondary">{formatDuration(step.durationMs)}</Typography.Text>
              {step.tokenInput + step.tokenOutput > 0 && (
                <Typography.Text type="secondary">
                  Token {step.tokenInput}/{step.tokenOutput}
                </Typography.Text>
              )}
            </Space>
          }
        >
          <Row gutter={16}>
            <Col span={14}>
              <Space orientation="vertical" size={8} style={{ width: '100%' }}>
                {step.url && (
                  <div>
                    <Typography.Text strong>当时 URL：</Typography.Text>
                    <Typography.Text copyable={{ text: step.url }}>{step.url}</Typography.Text>
                  </div>
                )}
                {step.prompt && (
                  <div>
                    <Typography.Text strong>目标：</Typography.Text>
                    <Typography.Text>{step.prompt}</Typography.Text>
                  </div>
                )}
                {step.aiResult && (
                  <div>
                    <Typography.Text strong>AI 识别：</Typography.Text>
                    <pre style={{ background: token.colorFillSecondary, padding: 8, borderRadius: 4, margin: '4px 0', whiteSpace: 'pre-wrap' }}>
                      {formatAiResult(step.aiResult)}
                    </pre>
                  </div>
                )}
                {step.error && (
                  <div>
                    <Typography.Text strong>失败原因：</Typography.Text>
                    <Typography.Text type="danger">{step.error}</Typography.Text>
                  </div>
                )}
              </Space>
            </Col>
            <Col span={10}>
              <Image.PreviewGroup>
                <Space>
                  {step.shotBefore && (
                    <div>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        执行前
                      </Typography.Text>
                      <Image width="100%" src={screenshotUrl(step.shotBefore)} alt="执行前截图" />
                    </div>
                  )}
                  {step.shotAfter && (
                    <div>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        执行后
                      </Typography.Text>
                      <Image width="100%" src={screenshotUrl(step.shotAfter)} alt="执行后截图" />
                    </div>
                  )}
                </Space>
              </Image.PreviewGroup>
            </Col>
          </Row>
        </Card>
      ))}
    </Space>
  );
}

function formatAiResult(raw: string) {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
