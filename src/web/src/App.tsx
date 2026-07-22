import {
	BulbOutlined,
	HistoryOutlined,
	MoonOutlined,
	UnorderedListOutlined,
	PlayCircleOutlined,
	ProfileOutlined,
	SettingOutlined,
} from "@ant-design/icons";
import {
	App as AntApp,
	ConfigProvider,
	Flex,
	Layout,
	Menu,
	Switch,
	theme as antdTheme,
	Tooltip,
} from "antd";
import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import {
	APP_SHELL_STYLE,
	CONTENT_STYLE,
	HEADER_STYLE,
	MAIN_LAYOUT_STYLE,
	SIDER_STYLE,
} from "./layout";
import HistoryPage from "./pages/HistoryPage";
import QueueEditPage from "./pages/QueueEditPage";
import QueuesPage from "./pages/QueuesPage";
import RunDetailPage from "./pages/RunDetailPage";
import RunPage from "./pages/RunPage";
import SettingsPage from "./pages/SettingsPage";
import TaskEditPage from "./pages/TaskEditPage";
import TasksPage from "./pages/TasksPage";
import { getStoredTheme, setStoredTheme, type ThemeMode } from "./theme";
import { ThemeModeContext } from "./theme-context";

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

function AppContent({
	themeMode,
	onThemeChange,
}: {
	themeMode: ThemeMode;
	onThemeChange: (themeMode: ThemeMode) => void;
}) {
	const location = useLocation();
	const { token } = antdTheme.useToken();
	const selectedKey =
		menuItems.find((item) => location.pathname.startsWith(item.key))?.key ??
		"/tasks";

	return (
		<ThemeModeContext.Provider value={themeMode}>
			<AntApp>
				<Layout style={APP_SHELL_STYLE}>
					<Sider
						data-testid="app-sidebar"
						style={SIDER_STYLE}
						theme={themeMode}
					>
						<div style={{ padding: 16, fontWeight: "bold", fontSize: 16 }}>
							AI 自动化测试
						</div>
						<Menu mode="inline" selectedKeys={[selectedKey]} items={menuItems} />
					</Sider>
					<Layout style={MAIN_LAYOUT_STYLE}>
						<Header
							data-testid="app-header"
							style={{
								...HEADER_STYLE,
								background: token.colorBgContainer,
								padding: "0 24px",
								fontSize: 16,
								borderBottom: `1px solid ${token.colorBorderSecondary}`,
							}}
						>
							<Flex justify="space-between" align="center">
								{PAGE_TITLES[selectedKey]}
								<Tooltip
									title={
										themeMode === "dark"
											? "切换到亮色模式"
											: "切换到黑夜模式"
									}
								>
									<Switch
										aria-label="黑夜模式"
										checked={themeMode === "dark"}
										checkedChildren={<MoonOutlined />}
										unCheckedChildren={<BulbOutlined />}
										onChange={(checked) =>
											onThemeChange(checked ? "dark" : "light")
										}
									/>
								</Tooltip>
							</Flex>
						</Header>
						<Content data-testid="app-content" style={CONTENT_STYLE}>
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
		</ThemeModeContext.Provider>
	);
}

export default function App() {
	const [themeMode, setThemeMode] = useState(() =>
		getStoredTheme(window.localStorage),
	);

	useEffect(() => {
		document.documentElement.style.colorScheme = themeMode;
	}, [themeMode]);

	const changeTheme = (nextThemeMode: ThemeMode) => {
		setThemeMode(nextThemeMode);
		setStoredTheme(window.localStorage, nextThemeMode);
	};

	return (
		<ConfigProvider
			theme={{
				algorithm:
					themeMode === "dark"
						? antdTheme.darkAlgorithm
						: antdTheme.defaultAlgorithm,
			}}
		>
			<AppContent themeMode={themeMode} onThemeChange={changeTheme} />
		</ConfigProvider>
	);
}
