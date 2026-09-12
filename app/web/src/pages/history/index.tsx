import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { RunRecord } from '@lookrun/shared';
import { RunStatusTag, formatDuration, formatTime } from '../../components';
import { LoadingBlock } from '../../components/loading-block';
import { notify } from '../../components/notify';
import { PageCard } from '../../components/page-card';
import { Button } from '../../components/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '../../components/ui/table';
import { api } from './api';

const PAGE_SIZE = 20;

export default function HistoryPage() {
    const [runs, setRuns] = useState<RunRecord[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        api.listRuns({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
            .then((result) => {
                setRuns(result.list);
                setTotal(result.total);
            })
            .catch((error: Error) => notify.error(error.message))
            .finally(() => setLoading(false));
    }, [page]);

    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return (
        <PageCard title='历史记录'>
            {loading ? <LoadingBlock /> : <HistoryTable runs={runs} />}
            <div className='mt-4 flex items-center justify-between text-sm text-muted-foreground'>
                <span>{`共 ${total} 次运行`}</span>
                <div className='flex items-center gap-2'>
                    <Button
                        variant='outline'
                        size='sm'
                        disabled={page <= 1}
                        onClick={() => setPage((current) => current - 1)}
                    >
                        上一页
                    </Button>
                    <span>
                        {page} / {pageCount}
                    </span>
                    <Button
                        variant='outline'
                        size='sm'
                        disabled={page >= pageCount}
                        onClick={() => setPage((current) => current + 1)}
                    >
                        下一页
                    </Button>
                </div>
            </div>
        </PageCard>
    );
}

function HistoryTable({ runs }: { runs: RunRecord[] }) {
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className='w-[70px]'>ID</TableHead>
                    <TableHead className='w-[200px]'>任务</TableHead>
                    <TableHead className='w-[100px]'>状态</TableHead>
                    <TableHead className='w-[180px]'>模型</TableHead>
                    <TableHead className='w-[180px]'>开始时间</TableHead>
                    <TableHead className='w-[100px]'>耗时</TableHead>
                    <TableHead className='w-[120px]'>Token</TableHead>
                    <TableHead>错误</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {runs.map((record) => (
                    <TableRow key={record.id}>
                        <TableCell>{record.id}</TableCell>
                        <TableCell>
                            <Link
                                className='text-primary underline-offset-4 hover:underline'
                                to={`/history/${record.id}`}
                            >
                                {record.taskName}
                            </Link>
                        </TableCell>
                        <TableCell>
                            <RunStatusTag status={record.status} />
                        </TableCell>
                        <TableCell>{record.model}</TableCell>
                        <TableCell>{formatTime(record.startedAt)}</TableCell>
                        <TableCell>{formatDuration(record.durationMs)}</TableCell>
                        <TableCell className='text-muted-foreground'>
                            {record.tokenInput + record.tokenOutput > 0
                                ? `${record.tokenInput}/${record.tokenOutput}`
                                : '-'}
                        </TableCell>
                        <TableCell className='max-w-[240px] truncate text-destructive'>
                            {record.error}
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
