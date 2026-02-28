import { useEffect, useState } from 'react';
import { Card, Table, Tag, Button, Space, message, Empty } from 'antd';
import { ReloadOutlined, MobileOutlined } from '@ant-design/icons';
import { deviceApi, type Device } from '../services/api';

const statusMap: Record<string, { color: string; label: string }> = {
  connected: { color: 'green', label: '已连接' },
  disconnected: { color: 'default', label: '已断开' },
  busy: { color: 'orange', label: '使用中' },
};

export default function Devices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchDevices = async () => {
    setLoading(true);
    try {
      const data = await deviceApi.list();
      setDevices(data);
    } catch {
      // API not available
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const data = await deviceApi.refresh();
      setDevices(data);
      message.success('设备列表已刷新');
    } catch {
      message.error('刷新失败');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: '设备名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => (
        <Space>
          <MobileOutlined />
          {name}
        </Space>
      ),
    },
    {
      title: '平台',
      dataIndex: 'platform',
      key: 'platform',
      render: (v: string) => <Tag color={v === 'android' ? 'green' : 'purple'}>{v.toUpperCase()}</Tag>,
    },
    { title: 'UDID', dataIndex: 'udid', key: 'udid' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (s: string) => {
        const info = statusMap[s] ?? { color: 'default', label: s };
        return <Tag color={info.color}>{info.label}</Tag>;
      },
    },
  ];

  return (
    <Card
      title="设备管理"
      extra={
        <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={loading}>
          刷新设备
        </Button>
      }
    >
      {devices.length > 0 ? (
        <Table dataSource={devices} columns={columns} rowKey="id" loading={loading} pagination={false} />
      ) : (
        <Empty description="未检测到连接的设备。请连接 Android/iOS 设备后点击刷新。" />
      )}
    </Card>
  );
}
