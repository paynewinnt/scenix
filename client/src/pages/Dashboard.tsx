import { useCallback, useEffect, useState } from 'react';
import { Row, Col, Card, Statistic, Table, Tag, Button, Space } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  PlayCircleOutlined,
  FileTextOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  readinessApi,
  testRunApi,
  testCaseApi,
  type RuntimeReadinessReport,
  type TestRun,
  type TestCase,
} from '../services/api';
import { useSSE } from '../hooks/useSSE';
import { formatChinaDateTime } from '../utils/datetime';

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

export default function Dashboard() {
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [cases, setCases] = useState<TestCase[]>([]);
  const [readiness, setReadiness] = useState<RuntimeReadinessReport | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);

  const fetchData = useCallback(() => {
    testRunApi.list().then(setRuns).catch(() => {});
    testCaseApi.list().then(setCases).catch(() => {});
  }, []);

  const fetchReadiness = useCallback(() => {
    setReadinessLoading(true);
    readinessApi.get().then(setReadiness).catch(() => {}).finally(() => setReadinessLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
    fetchReadiness();
  }, [fetchData, fetchReadiness]);

  // SSE: real-time updates for test runs
  useSSE({
    events: {
      'test-run:created': (data) => {
        setRuns((prev) => [data as TestRun, ...prev]);
      },
      'test-run:updated': (data) => {
        const updated = data as TestRun;
        setRuns((prev) =>
          prev.map((r) => (r.id === updated.id ? updated : r)),
        );
      },
      'test-run:deleted': (data) => {
        const deleted = data as { id: string };
        setRuns((prev) => prev.filter((item) => item.id !== deleted.id));
      },
      reconnect: () => {
        fetchData();
        fetchReadiness();
      },
    },
  });

  const totalCases = cases.length;
  const totalRuns = runs.length;
  const passedRuns = runs.filter((r) => r.status === 'passed').length;
  const failedRuns = runs.filter((r) => r.status === 'failed').length;
  const passRate = totalRuns > 0 ? ((passedRuns / totalRuns) * 100).toFixed(1) : '0';

  const recentRuns = runs.slice(0, 10);
  const readinessStatusColors: Record<string, string> = {
    ready: 'green',
    warning: 'orange',
    error: 'red',
    unsupported: 'default',
  };
  const readinessStatusLabels: Record<string, string> = {
    ready: '已就绪',
    warning: '需关注',
    error: '未就绪',
    unsupported: '不支持',
  };

  const columns = [
    { title: '套件名称', dataIndex: 'suiteName', key: 'suiteName' },
    { title: '平台', dataIndex: 'platform', key: 'platform', render: (v: string) => v.toUpperCase() },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (s: string) => <Tag color={statusColors[s]}>{statusLabels[s] ?? s}</Tag>,
    },
    {
      title: '开始时间',
      dataIndex: 'startedAt',
      key: 'startedAt',
      render: (value: string) => formatChinaDateTime(value),
    },
  ];

  return (
    <>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic title="测试用例总数" value={totalCases} prefix={<FileTextOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="执行总次数" value={totalRuns} prefix={<PlayCircleOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="通过次数"
              value={passedRuns}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="失败次数"
              value={failedRuns}
              prefix={<CloseCircleOutlined />}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={8}>
          <Card title="通过率">
            <Statistic value={passRate} suffix="%" valueStyle={{ fontSize: 48 }} />
          </Card>
        </Col>
        <Col span={16}>
          <Card title="最近执行记录">
            <Table
              dataSource={recentRuns}
              columns={columns}
              rowKey="id"
              pagination={false}
              size="small"
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginTop: 24 }}>
        <Col span={24}>
          <Card
            title="运行环境"
            extra={
              <Button icon={<ReloadOutlined />} onClick={fetchReadiness} loading={readinessLoading}>
                刷新检查
              </Button>
            }
          >
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              {readiness?.checks.map((check) => (
                <Card key={check.key} size="small" bodyStyle={{ padding: 16 }}>
                  <Space direction="vertical" size={6} style={{ width: '100%' }}>
                    <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                      <span style={{ fontWeight: 600 }}>{check.label}</span>
                      <Tag color={readinessStatusColors[check.status]}>
                        {readinessStatusLabels[check.status] ?? check.status}
                      </Tag>
                    </Space>
                    <span>{check.summary}</span>
                    <div style={{ color: '#8c8c8c', fontSize: 12 }}>
                      {check.details.slice(0, 3).join(' · ')}
                    </div>
                  </Space>
                </Card>
              ))}
            </Space>
          </Card>
        </Col>
      </Row>
    </>
  );
}
