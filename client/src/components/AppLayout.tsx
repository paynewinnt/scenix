import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, theme } from 'antd';
import {
  DashboardOutlined,
  FileTextOutlined,
  AppstoreOutlined,
  PlayCircleOutlined,
  BarChartOutlined,
  MobileOutlined,
} from '@ant-design/icons';

const { Header, Sider, Content } = Layout;

const menuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: '/test-cases', icon: <FileTextOutlined />, label: '测试用例' },
  { key: '/test-suites', icon: <AppstoreOutlined />, label: '测试套件' },
  { key: '/test-run', icon: <PlayCircleOutlined />, label: '执行测试' },
  { key: '/reports', icon: <BarChartOutlined />, label: '测试报告' },
  { key: '/devices', icon: <MobileOutlined />, label: '设备管理' },
];

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = theme.useToken();

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="dark"
      >
        <div
          style={{
            height: 48,
            margin: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 700,
            fontSize: collapsed ? 14 : 18,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
        >
          {collapsed ? 'AI' : 'AI Test Platform'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            padding: '0 24px',
            background: token.colorBgContainer,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 600 }}>
            AI-Driven UI Automation Testing Platform
          </span>
          <span style={{ color: token.colorTextSecondary, fontSize: 13 }}>
            Powered by Midscene.js + Appium
          </span>
        </Header>
        <Content style={{ margin: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
