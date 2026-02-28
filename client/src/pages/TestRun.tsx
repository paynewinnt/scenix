import { useEffect, useState } from 'react';
import {
  Card,
  Table,
  Button,
  Select,
  Space,
  Tag,
  message,
  Row,
  Col,
  Typography,
} from 'antd';
import { PlayCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  testCaseApi,
  testRunApi,
  deviceApi,
  type TestCase,
  type TestRun as TestRunType,
  type Device,
} from '../services/api';

const { Text } = Typography;

const statusColors: Record<string, string> = {
  passed: 'green',
  failed: 'red',
  running: 'blue',
  pending: 'default',
  error: 'orange',
};

const statusLabels: Record<string, string> = {
  passed: '通过',
  failed: '失败',
  running: '运行中',
  pending: '等待中',
  error: '异常',
};

export default function TestRun() {
  const [cases, setCases] = useState<TestCase[]>([]);
  const [runs, setRuns] = useState<TestRunType[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedCase, setSelectedCase] = useState<string>();
  const [selectedDevice, setSelectedDevice] = useState<string>();
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    testCaseApi.list().then(setCases).catch(() => {});
    testRunApi.list().then(setRuns).catch(() => {});
    deviceApi.list().then(setDevices).catch(() => {});
  }, []);

  const handleStart = async () => {
    if (!selectedCase) {
      message.warning('请先选择测试用例');
      return;
    }
    setStarting(true);
    try {
      await testRunApi.start(selectedCase, selectedDevice);
      message.success('测试已启动');
      const updated = await testRunApi.list();
      setRuns(updated);
    } catch {
      message.error('启动测试失败');
    } finally {
      setStarting(false);
    }
  };

  const refreshRuns = async () => {
    const updated = await testRunApi.list();
    setRuns(updated);
  };

  const selectedCaseObj = cases.find((c) => c.id === selectedCase);

  const columns = [
    { title: '用例名称', dataIndex: 'testCaseName', key: 'testCaseName' },
    { title: '平台', dataIndex: 'platform', key: 'platform', render: (v: string) => v.toUpperCase() },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (s: string) => <Tag color={statusColors[s]}>{statusLabels[s] ?? s}</Tag>,
    },
    { title: '开始时间', dataIndex: 'startedAt', key: 'startedAt' },
    { title: '结束时间', dataIndex: 'finishedAt', key: 'finishedAt', render: (v?: string) => v ?? '-' },
    {
      title: '错误信息',
      dataIndex: 'errorMessage',
      key: 'errorMessage',
      ellipsis: true,
      render: (v?: string) => v ? <Text type="danger">{v}</Text> : '-',
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card title="执行测试">
        <Row gutter={16} align="middle">
          <Col span={8}>
            <Select
              style={{ width: '100%' }}
              placeholder="选择测试用例"
              value={selectedCase}
              onChange={setSelectedCase}
              options={cases.map((c) => ({
                value: c.id,
                label: `${c.name} (${c.platform.toUpperCase()})`,
              }))}
              allowClear
            />
          </Col>
          <Col span={8}>
            <Select
              style={{ width: '100%' }}
              placeholder="选择设备（移动端可选）"
              value={selectedDevice}
              onChange={setSelectedDevice}
              options={devices
                .filter((d) => d.status === 'connected')
                .map((d) => ({ value: d.id, label: `${d.name} (${d.platform})` }))}
              allowClear
              disabled={selectedCaseObj?.platform === 'web'}
            />
          </Col>
          <Col span={8}>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={handleStart}
              loading={starting}
            >
              开始执行
            </Button>
          </Col>
        </Row>
      </Card>

      <Card
        title="执行记录"
        extra={
          <Button icon={<ReloadOutlined />} onClick={refreshRuns}>
            刷新
          </Button>
        }
      >
        <Table
          dataSource={[...runs].reverse()}
          columns={columns}
          rowKey="id"
          pagination={{ pageSize: 15 }}
        />
      </Card>
    </Space>
  );
}
