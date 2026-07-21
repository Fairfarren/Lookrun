import { StopOutlined } from '@ant-design/icons';
import { App as AntApp, Button, Card, Col, Empty, Flex, Row, Space, Spin, Tag, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';
import type { RunStepRecord } from '../../../shared/types';
import { api, type CurrentRunState } from '../api';
import { RunStatusTag, formatDuration } from '../components';
import { useWebSocket, type WsMessage } from '../hooks';

interface LiveStep {
  stepIndex: number;
  stepName: string;
  action: string;
  status: 'running' | 'success' | 'failed';
  record?: RunStepRecord;
}

export default function RunPage() {
  const { message } = AntApp.useApp();
  const [current, setCurrent] = useState<CurrentRunState>({ status: 'idle', run: null });
  const [frame, setFrame] = useState<string | null>(null);
  const [steps, setSteps] = useState<LiveStep[]>([]);
  const [finishedStatus, setFinishedStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const stepListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .currentRun()
      .then(setCurrent)
      .catch((error: Error) => message.error(error.message))
      .finally(() => setLoading(false));
  }, []);

  const handleMessage = (msg: WsMessage) => {
    if (msg.type === 'frame') {
      setFrame(msg.data);
      return;
    }
    if (msg.type === 'step-start') {
      setSteps((prev) => [
        ...prev,
        { stepIndex: msg.stepIndex, stepName: msg.stepName, action: msg.action, status: 'running' },
      ]);
      setCurrent((prev) =>
        prev.run ? { status: 'running', run: { ...prev.run, currentStepIndex: msg.stepIndex, totalSteps: msg.totalSteps } } : prev,
      );
      return;
    }
    if (msg.type === 'step') {
      setSteps((prev) =>
        prev.map((item) =>
          item.stepIndex === msg.step.stepIndex ? { ...item, status: msg.step.status, record: msg.step } : item,
        ),
      );
      return;
    }
    if (msg.type === 'run') {
      if (msg.run.status === 'running') {
        setCurrent({
          status: 'running',
          run: {
            runId: msg.run.id,
            taskName: msg.run.taskName,
            model: msg.run.model,
            startedAt: msg.run.startedAt,
            currentStepIndex: -1,
            totalSteps: 0,
          },
        });
        setSteps([]);
        setFinishedStatus(null);
      } else {
        setCurrent({ status: 'idle', run: null });
        setFinishedStatus(msg.run.status);
      }
    }
  };

  useWebSocket(handleMessage);

  // 步骤增加时滚动到底部
  useEffect(() => {
    stepListRef.current?.scrollTo({ top: stepListRef.current.scrollHeight, behavior: 'smooth' });
  }, [steps.length]);

  const stop = async () => {
    try {
      await api.stopRun();
      message.info('已发送停止指令');
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  };

  if (loading) {
    return <Spin style={{ display: 'block', margin: '80px auto' }} />;
  }

  const running = current.status === 'running';

  // 一屏高度：减去顶部导航、边距、卡片标题和底部结果行，保证画面区不溢出视口
  const frameAreaHeight = 'calc(100vh - 250px)';

  return (
    <Row gutter={16}>
      <Col span={10}>
        <Card
          title="实时画面"
          extra={
            running ? (
              <Button danger icon={<StopOutlined />} onClick={stop}>
                停止运行
              </Button>
            ) : undefined
          }
        >
          {running || frame ? (
            <div
              style={{
                background: '#000',
                borderRadius: 8,
                overflow: 'hidden',
                height: frameAreaHeight,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {frame ? (
                <img
                  src={`data:image/jpeg;base64,${frame}`}
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
                  alt="实时画面"
                />
              ) : (
                <div style={{ color: '#fff' }}>等待浏览器画面...</div>
              )}
            </div>
          ) : (
            <Empty description="当前没有运行中的任务，到「任务」页面发起一次运行" />
          )}
          {finishedStatus && !running && (
            <div style={{ marginTop: 12 }}>
              上次运行结果：<RunStatusTag status={finishedStatus as never} />
            </div>
          )}
        </Card>
      </Col>
      <Col span={14}>
        <Card
          title={
            <Space>
              步骤日志
              {current.run && (
                <Typography.Text type="secondary">
                  {current.run.taskName}（{current.run.currentStepIndex + 1}/{current.run.totalSteps || '?'}）
                </Typography.Text>
              )}
            </Space>
          }
        >
          <div ref={stepListRef} style={{ maxHeight: frameAreaHeight, overflowY: 'auto' }}>
            {steps.length === 0 && <Typography.Text type="secondary">{running ? '准备中...' : '暂无步骤'}</Typography.Text>}
            <Flex vertical>
              {steps.map((item) => (
                <div key={item.stepIndex} style={{ padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
                  <Space orientation="vertical" size={2} style={{ width: '100%' }}>
                    <Space wrap>
                      <Tag>{`#${item.stepIndex + 1}`}</Tag>
                      <Typography.Text strong>{item.stepName}</Typography.Text>
                      <Tag color="blue">{item.action}</Tag>
                      {item.status === 'running' && <Tag color="processing">执行中</Tag>}
                      {item.status === 'success' && <Tag color="success">成功</Tag>}
                      {item.status === 'failed' && <Tag color="error">失败</Tag>}
                      {item.record && <Typography.Text type="secondary">{formatDuration(item.record.durationMs)}</Typography.Text>}
                    </Space>
                    {item.record?.error && <Typography.Text type="danger">{item.record.error}</Typography.Text>}
                    {item.record?.url && (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {item.record.url}
                      </Typography.Text>
                    )}
                  </Space>
                </div>
              ))}
            </Flex>
          </div>
        </Card>
      </Col>
    </Row>
  );
}
