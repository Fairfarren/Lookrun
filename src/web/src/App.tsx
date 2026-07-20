import { HistoryOutlined, PlayCircleOutlined, ProfileOutlined, SettingOutlined } from '@ant-design/icons';
import { Layout, Menu } from 'antd';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';

const { Sider, Header, Content } = Layout;

const menuItems = [
  { key: '/tasks', icon: <ProfileOutlined />, label: <Link to="/tasks">任务</Link> },
  { key: '/run', icon: <PlayCircleOutlined />, label: <Link to="/run">实时运行</Link> },
  { key: '/history', icon: <HistoryOutlined />, label: <Link to="/history">历史记录</Link> },
  { key: '/settings', icon: <SettingOutlined />, label: <Link to="/settings">设置</Link> },
];

function Placeholder({ title }: { title: string }) {
  return <h2>{title}</h2>;
}

export default function App() {
  const location = useLocation();
  const selectedKey = menuItems.find((item) => location.pathname.startsWith(item.key))?.key ?? '/tasks';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider theme="light">
        <div style={{ padding: 16, fontWeight: 'bold', fontSize: 16 }}>AI 自动化测试</div>
        <Menu mode="inline" selectedKeys={[selectedKey]} items={menuItems} />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 24px', fontSize: 16 }}>
          {menuItems.find((item) => item.key === selectedKey)?.label}
        </Header>
        <Content style={{ margin: 16 }}>
          <Routes>
            <Route path="/" element={<Navigate to="/tasks" replace />} />
            <Route path="/tasks" element={<Placeholder title="任务" />} />
            <Route path="/run" element={<Placeholder title="实时运行" />} />
            <Route path="/history" element={<Placeholder title="历史记录" />} />
            <Route path="/settings" element={<Placeholder title="设置" />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}
