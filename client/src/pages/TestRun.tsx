import { useCallback, useEffect, useMemo, useState } from 'react';
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
  Popconfirm,
} from 'antd';
import { DeleteOutlined, PlayCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  deviceApi,
  getApiErrorMessage,
  testRunApi,
  testSuiteApi,
  type Device,
  type TestRun,
  type TestSuite,
} from '../services/api';
import { useSSE } from '../hooks/useSSE';
import { formatChinaDateTime } from '../utils/datetime';
import { buildQueueStatusSummary } from './test-run-queue-utils';

const { Text } = Typography;

const statusColors: Record<string, string> = {
  passed: 'green',
  failed: 'red',
  queued: 'purple',
  running: 'blue',
  pending: 'default',
  error: 'orange',
};

const statusLabels: Record<string, string> = {
  passed: '通过',
  failed: '失败',
  queued: '排队中',
  running: '运行中',
  pending: '等待中',
  error: '异常',
};

export default function TestRunPage() {
  const [suites, setSuites] = useState<TestSuite[]>([]);
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedSuite, setSelectedSuite] = useState<string>();
  const [selectedDevice, setSelectedDevice] = useState<string>();
  const [starting, setStarting] = useState(false);

  const fetchRuns = useCallback(() => {
    testRunApi.list().then(setRuns).catch(() => {});
  }, []);

  const fetchPageData = useCallback(() => {
    testSuiteApi.list().then(setSuites).catch(() => {});
    fetchRuns();
    deviceApi.list().then(setDevices).catch(() => {});
  }, [fetchRuns]);

  useEffect(() => {
    fetchPageData();
  }, [fetchPageData]);

  useSSE({
    events: {
      'test-run:created': (data) => {
        const created = data as TestRun;
        setRuns((prev) => [created, ...prev]);
        if (created.deviceId) {
          deviceApi.list().then(setDevices).catch(() => {});
        }
      },
      'test-run:updated': (data) => {
        const updated = data as TestRun;
        setRuns((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
        if (updated.deviceId && ['queued', 'passed', 'failed', 'error'].includes(updated.status)) {
          deviceApi.list().then(setDevices).catch(() => {});
        }
      },
      'test-run:deleted': (data) => {
        const deleted = data as { id: string };
        setRuns((prev) => prev.filter((item) => item.id !== deleted.id));
        deviceApi.list().then(setDevices).catch(() => {});
      },
      reconnect: () => {
        fetchRuns();
        deviceApi.list().then(setDevices).catch(() => {});
      },
    },
  });

  const selectedSuiteObject = useMemo(
    () => suites.find((item) => item.id === selectedSuite),
    [selectedSuite, suites],
  );

  const handleStart = async () => {
    if (!selectedSuite) {
      message.warning('请先选择测试套件');
      return;
    }

    if ((selectedSuiteObject?.testCases.length ?? 0) === 0) {
      message.warning('测试套件至少需要包含一个测试用例');
      return;
    }

    setStarting(true);
    try {
      const createdRun = await testRunApi.start(selectedSuite, selectedDevice);
      deviceApi.list().then(setDevices).catch(() => {});
      message.success(createdRun.status === 'queued' ? '测试套件已加入队列' : '测试套件已启动');
    } catch (error) {
      message.error(getApiErrorMessage(error, '启动测试套件失败'));
    } finally {
      setStarting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await testRunApi.delete(id);
      setRuns((prev) => prev.filter((run) => run.id !== id));
      message.success('执行记录已删除');
    } catch {
      message.error('删除执行记录失败');
    }
  };

  const columns = [
    { title: '套件名称', dataIndex: 'suiteName', key: 'suiteName' },
    {
      title: '用例数',
      key: 'itemCount',
      render: (_: unknown, record: TestRun) => record.items.length,
    },
    {
      title: '平台',
      dataIndex: 'platform',
      key: 'platform',
      render: (value: string) => value.toUpperCase(),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => <Tag color={statusColors[status]}>{statusLabels[status] ?? status}</Tag>,
    },
    {
      title: '排队信息',
      key: 'queue',
      render: (_: unknown, record: TestRun) => buildQueueStatusSummary(record),
    },
    {
      title: '开始时间',
      dataIndex: 'startedAt',
      key: 'startedAt',
      render: (value: string) => formatChinaDateTime(value),
    },
    {
      title: '结束时间',
      dataIndex: 'finishedAt',
      key: 'finishedAt',
      render: (value?: string) => formatChinaDateTime(value),
    },
    {
      title: '错误信息',
      dataIndex: 'errorMessage',
      key: 'errorMessage',
      ellipsis: true,
      render: (value?: string) => (value ? <Text type="danger">{value}</Text> : '-'),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: unknown, record: TestRun) => (
        <Popconfirm
          title="确认删除这条执行记录?"
          onConfirm={() => handleDelete(record.id)}
          okText="删除"
          cancelText="取消"
          disabled={record.status === 'pending' || record.status === 'running'}
        >
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            disabled={record.status === 'pending' || record.status === 'running'}
          >
            删除
          </Button>
        </Popconfirm>
      ),
    },
  ];

  const itemColumns = [
    { title: '用例名称', dataIndex: 'testCaseName', key: 'testCaseName' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => <Tag color={statusColors[status]}>{statusLabels[status] ?? status}</Tag>,
    },
    {
      title: '开始时间',
      dataIndex: 'startedAt',
      key: 'startedAt',
      render: (value?: string) => formatChinaDateTime(value),
    },
    {
      title: '结束时间',
      dataIndex: 'finishedAt',
      key: 'finishedAt',
      render: (value?: string) => formatChinaDateTime(value),
    },
    {
      title: '错误信息',
      dataIndex: 'errorMessage',
      key: 'errorMessage',
      ellipsis: true,
      render: (value?: string) => (value ? <Text type="danger">{value}</Text> : '-'),
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card title="执行测试">
        <Row gutter={16} align="middle">
          <Col span={8}>
            <Select
              style={{ width: '100%' }}
              placeholder="选择测试套件"
              value={selectedSuite}
              onChange={(value) => {
                setSelectedSuite(value);
                setSelectedDevice(undefined);
              }}
              options={suites.map((suite) => ({
                value: suite.id,
                label: `${suite.name} (${suite.platform.toUpperCase()}, ${suite.testCases.length} 个用例)`,
              }))}
              allowClear
            />
          </Col>
          <Col span={8}>
            <Select
              style={{ width: '100%' }}
              placeholder="选择设备（移动端必选）"
              value={selectedDevice}
              onChange={setSelectedDevice}
              options={devices
                .filter((device) => device.status !== 'disconnected')
                .filter((device) =>
                  selectedSuiteObject?.platform ? device.platform === selectedSuiteObject.platform : true,
                )
                .map((device) => ({
                  value: device.id,
                  label:
                    device.platform === 'ios'
                      ? `${device.name} (${device.platform}, ${device.wdaHost ?? 'localhost'}:${device.wdaPort ?? 8100}${device.status === 'busy' ? ', 占用中可排队' : ''})`
                      : `${device.name} (${device.platform}${device.status === 'busy' ? ', 占用中可排队' : ''})`,
                }))}
              allowClear
              disabled={selectedSuiteObject?.platform === 'web' || !selectedSuiteObject}
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

        {selectedSuiteObject ? (
          <div style={{ marginTop: 16 }}>
            <Text type="secondary">套件用例顺序：</Text>
            <div style={{ marginTop: 8 }}>
              {selectedSuiteObject.testCases.map((item, index) => (
                <Tag key={item.id} color={platformColors[item.platform]}>
                  {index + 1}. {item.name}
                </Tag>
              ))}
            </div>
          </div>
        ) : null}
      </Card>

      <Card
        title="执行记录"
        extra={
          <Button icon={<ReloadOutlined />} onClick={fetchRuns}>
            刷新
          </Button>
        }
      >
        <Table
          dataSource={runs}
          columns={columns}
          rowKey="id"
          pagination={{ pageSize: 15 }}
          expandable={{
            expandedRowRender: (record: TestRun) => (
              <Table
                dataSource={record.items}
                columns={itemColumns}
                rowKey="id"
                pagination={false}
                size="small"
              />
            ),
            rowExpandable: (record: TestRun) => record.items.length > 0,
          }}
        />
      </Card>
    </Space>
  );
}

const platformColors: Record<string, string> = {
  web: 'blue',
  android: 'green',
  ios: 'purple',
};
