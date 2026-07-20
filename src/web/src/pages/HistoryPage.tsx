import { App as AntApp, Card, Table, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { RunRecord } from '../../../shared/types';
import { api } from '../api';
import { RunStatusTag, formatDuration, formatTime } from '../components';

const PAGE_SIZE = 20;

export default function HistoryPage() {
  const { message } = AntApp.useApp();
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .listRuns({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
      .then((result) => {
        setRuns(result.list);
        setTotal(result.total);
      })
      .catch((error: Error) => message.error(error.message))
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <Card title="历史记录">
      <Table<RunRecord>
        rowKey="id"
        loading={loading}
        dataSource={runs}
        pagination={{ current: page, pageSize: PAGE_SIZE, total, onChange: setPage, showTotal: (count) => `共 ${count} 次运行` }}
        columns={[
          { title: 'ID', dataIndex: 'id', width: 70 },
          {
            title: '任务',
            dataIndex: 'taskName',
            width: 200,
            render: (taskName: string, record) => <Link to={`/history/${record.id}`}>{taskName}</Link>,
          },
          { title: '状态', dataIndex: 'status', width: 100, render: (status: RunRecord['status']) => <RunStatusTag status={status} /> },
          { title: '模型', dataIndex: 'model', width: 180 },
          { title: '开始时间', dataIndex: 'startedAt', width: 180, render: formatTime },
          { title: '耗时', dataIndex: 'durationMs', width: 100, render: formatDuration },
          {
            title: 'Token',
            width: 120,
            render: (_, record) => (
              <Typography.Text type="secondary">
                {record.tokenInput + record.tokenOutput > 0 ? `${record.tokenInput}/${record.tokenOutput}` : '-'}
              </Typography.Text>
            ),
          },
          {
            title: '错误',
            dataIndex: 'error',
            ellipsis: true,
            render: (error: string | null) => (error ? <Typography.Text type="danger">{error}</Typography.Text> : null),
          },
        ]}
      />
    </Card>
  );
}
