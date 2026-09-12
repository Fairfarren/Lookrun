import { Navigate, Route, Routes } from 'react-router-dom';
import HistoryPage from './pages/history';
import RunDetailPage from './pages/history-detail';
import QueueEditPage from './pages/queue-edit';
import QueuesPage from './pages/queues';
import RunPage from './pages/run';
import SettingsPage from './pages/settings';
import TaskEditPage from './pages/task-edit';
import TasksPage from './pages/tasks';

export function AppRoutes() {
    return (
        <Routes>
            <Route path='/' element={<Navigate to='/tasks' replace />} />
            <Route path='/tasks' element={<TasksPage />} />
            <Route path='/tasks/new' element={<TaskEditPage />} />
            <Route path='/tasks/:id' element={<TaskEditPage />} />
            <Route path='/queues' element={<QueuesPage />} />
            <Route path='/queues/new' element={<QueueEditPage />} />
            <Route path='/queues/:id' element={<QueueEditPage />} />
            <Route path='/run' element={<RunPage />} />
            <Route path='/history' element={<HistoryPage />} />
            <Route path='/history/:id' element={<RunDetailPage />} />
            <Route path='/settings' element={<SettingsPage />} />
        </Routes>
    );
}
