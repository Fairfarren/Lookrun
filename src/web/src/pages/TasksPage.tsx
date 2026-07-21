import { DeleteOutlined, EditOutlined, PlayCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { App as AntApp, Button, Card, Empty, Flex, Modal, Select, Space, Spin, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TaskRecord } from '../../../shared/types';
import { api, type ModelBrief } from '../api';
import { formatTime } from '../components';

export default function TasksPage() {
  const { message, modal } = AntApp.useApp();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [runTask, setRunTask] = useState<TaskRecord | null>(null);
  const [models, setModels] = useState<ModelBrief[]>([]);
  const [modelId, setModelId] = useState<string>();
  const [starting, setStarting] = useState(false);

  const loadTasks = () => {
    setLoading(true);
    api
      .listTasks()
      .then(setTasks)
      .catch((error: Error) => message.error(error.message))
      .finally(() => setLoading(false));
  };

  useEffect(loadTasks, []);

  const openRunModal = (task: TaskRecord) => {
    setRunTask(task);
    api
      .listModels()
      .then((result) => {
        setModels(result.models);
        setModelId(result.selected ?? result.models[0]?.id);
      })
      .catch((error: Error) => message.error(error.message));
  };

  const startRun = async () => {
    if (!runTask || !modelId) {
      return;
    }
    setStarting(true);
    try {
      const result = await api.startRun({ taskId: runTask.id, modelId });
      setRunTask(null);
      if (result.queued) {
        // 当前有任务在跑，自动入队
        message.success('已加入队列排队，可到「实时运行」页查看');
      } else {
        navigate('/run');
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setStarting(false);
    }
  };

  const confirmDelete = (task: TaskRecord) => {
    modal.confirm({
      title: `删除任务「${task.name}」？`,
      content: '删除后不可恢复，历史运行记录会保留。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        await api.deleteTask(task.id);
        message.success('已删除');
        loadTasks();
      },
    });
  };

  return (
    <Card
      title="任务列表"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/tasks/new')}>
          新建任务
        </Button>
      }
    >
      {tasks.length === 0 && !loading ? (
        <Empty description="还没有任务，点击右上角新建一个" />
      ) : loading ? (
        <Spin style={{ display: 'block', margin: '40px auto' }} />
      ) : (
        <Flex vertical>
          {tasks.map((task) => (
            <Flex key={task.id} justify="space-between" align="center" style={{ padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
              <Space orientation="vertical" size={2}>
                <Typography.Text strong>{task.name}</Typography.Text>
                <Typography.Text type="secondary">更新于 {formatTime(task.updatedAt)}</Typography.Text>
              </Space>
              <Space>
                <Button type="primary" ghost icon={<PlayCircleOutlined />} onClick={() => openRunModal(task)}>
                  运行
                </Button>
                <Button icon={<EditOutlined />} onClick={() => navigate(`/tasks/${task.id}`)}>
                  编辑
                </Button>
                <Button danger icon={<DeleteOutlined />} onClick={() => confirmDelete(task)} />
              </Space>
            </Flex>
          ))}
        </Flex>
      )}

      <Modal
        title={`运行任务「${runTask?.name}」`}
        open={runTask !== null}
        onOk={startRun}
        onCancel={() => setRunTask(null)}
        okText="开始运行"
        cancelText="取消"
        confirmLoading={starting}
      >
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Typography.Text>选择本次运行使用的 AI 模型：</Typography.Text>
          <Select
            style={{ width: '100%' }}
            value={modelId}
            onChange={setModelId}
            options={models.map((model) => ({ label: `${model.name}（${model.model}）`, value: model.id }))}
          />
          <Typography.Text type="secondary">运行过程中可在「实时运行」页面查看画面与步骤日志。</Typography.Text>
        </Space>
      </Modal>
    </Card>
  );
}
