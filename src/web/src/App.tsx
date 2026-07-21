import {
	HistoryOutlined,
	UnorderedListOutlined,
	PlayCircleOutlined,
	ProfileOutlined,
	SettingOutlined,
} from "@ant-design/icons";
import { App as AntApp, Layout, Menu } from "antd";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import HistoryPage from "./pages/HistoryPage";
import QueueEditPage from "./pages/QueueEditPage";
import QueuesPage from "./pages/QueuesPage";
import RunDetailPage from "./pages/RunDetailPage";
import RunPage from "./pages/RunPage";
import SettingsPage from "./pages/SettingsPage";
import TaskEditPage from "./pages/TaskEditPage";
import TasksPage from "./pages/TasksPage";

const { Sider, Header, Content } = Layout;

const menuItems = [
	{
		key: "/tasks",
		icon: <ProfileOutlined />,
		label: <Link to="/tasks">任务</Link>,
	},
	{
		key: "/queues",
		icon: <UnorderedListOutlined />,
		label: <Link to="/queues">队列</Link>,
	},
	{
		key: "/run",
		icon: <PlayCircleOutlined />,
		label: <Link to="/run">实时运行</Link>,
	},
	{
		key: "/history",
		icon: <HistoryOutlined />,
		label: <Link to="/history">历史记录</Link>,
	},
	{
		key: "/settings",
		icon: <SettingOutlined />,
		label: <Link to="/settings">设置</Link>,
	},
];

const PAGE_TITLES: Record<string, string> = {
	"/tasks": "任务",
	"/queues": "队列",
	"/run": "实时运行",
	"/history": "历史记录",
	"/settings": "设置",
};

export default function App() {
	const location = useLocation();
	const selectedKey =
		menuItems.find((item) => location.pathname.startsWith(item.key))?.key ??
		"/tasks";

	return (
		<AntApp>
			<Layout style={{ minHeight: "100vh" }}>
				<Sider theme="light">
					<div style={{ padding: 16, fontWeight: "bold", fontSize: 16 }}>
						AI 自动化测试
					</div>
					<Menu mode="inline" selectedKeys={[selectedKey]} items={menuItems} />
				</Sider>
				<Layout>
					<Header
						style={{
							background: "#fff",
							padding: "0 24px",
							fontSize: 16,
							borderBottom: "1px solid #f0f0f0",
						}}
					>
						{PAGE_TITLES[selectedKey]}
					</Header>
					<Content style={{ margin: 16 }}>
						<Routes>
							<Route path="/" element={<Navigate to="/tasks" replace />} />
							<Route path="/tasks" element={<TasksPage />} />
							<Route path="/tasks/new" element={<TaskEditPage />} />
							<Route path="/tasks/:id" element={<TaskEditPage />} />
							<Route path="/queues" element={<QueuesPage />} />
							<Route path="/queues/new" element={<QueueEditPage />} />
							<Route path="/queues/:id" element={<QueueEditPage />} />
							<Route path="/run" element={<RunPage />} />
							<Route path="/history" element={<HistoryPage />} />
							<Route path="/history/:id" element={<RunDetailPage />} />
							<Route path="/settings" element={<SettingsPage />} />
						</Routes>
					</Content>
				</Layout>
			</Layout>
		</AntApp>
	);
}
