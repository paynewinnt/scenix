import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Result,
  Row,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd';
import {
  ArrowLeftOutlined,
  LinkOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { testRunApi, type TestRun } from '../services/api';
import { useSSE } from '../hooks/useSSE';
import { formatChinaDateTime } from '../utils/datetime';
import { buildReportEntries, resolveSelectedReportEntry } from './report-detail-utils';

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

export default function ReportDetail() {
  const navigate = useNavigate();
  const { runId } = useParams<{ runId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [run, setRun] = useState<TestRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const requestedItemId = searchParams.get('itemId');

  const fetchRun = useCallback(async () => {
    if (!runId) {
      return;
    }

    setLoading(true);
    try {
      const data = await testRunApi.get(runId);
      setRun(data);
      setNotFound(false);
    } catch {
      setRun(null);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    fetchRun();
  }, [fetchRun]);

  useSSE({
    events: {
      'test-run:updated': (data) => {
        const updated = data as TestRun;
        if (updated.id === runId) {
          setRun(updated);
          setNotFound(false);
        }
      },
      'test-run:deleted': (data) => {
        const deleted = data as { id: string };
        if (deleted.id === runId) {
          setRun(null);
          setNotFound(true);
        }
      },
      reconnect: () => {
        fetchRun();
      },
    },
  });

  const entries = useMemo(() => (run ? buildReportEntries(run) : []), [run]);
  const selectedEntry = useMemo(
    () => (run ? resolveSelectedReportEntry(run, requestedItemId) : null),
    [requestedItemId, run],
  );

  const handleSelectEntry = (itemId?: string) => {
    if (itemId) {
      setSearchParams({ itemId });
      return;
    }

    setSearchParams({});
  };

  if (!runId) {
    return <Result status="404" title="缺少运行 ID" />;
  }

  if (notFound && !loading) {
    return (
      <Result
        status="404"
        title="未找到对应的测试报告"
        extra={
          <Button type="primary" icon={<ArrowLeftOutlined />} onClick={() => navigate('/reports')}>
            返回报告列表
          </Button>
        }
      />
    );
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card
        loading={loading}
        title="报告详情"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchRun}>
              刷新
            </Button>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/reports')}>
              返回报告列表
            </Button>
          </Space>
        }
      >
        {run ? (
          <Descriptions column={{ xs: 1, sm: 2, lg: 3 }} size="small">
            <Descriptions.Item label="套件名称">{run.suiteName}</Descriptions.Item>
            <Descriptions.Item label="平台">{run.platform.toUpperCase()}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={statusColors[run.status]}>{statusLabels[run.status] ?? run.status}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="开始时间">{formatChinaDateTime(run.startedAt)}</Descriptions.Item>
            <Descriptions.Item label="结束时间">{formatChinaDateTime(run.finishedAt)}</Descriptions.Item>
            <Descriptions.Item label="用例数量">{run.items.length}</Descriptions.Item>
            <Descriptions.Item label="设备">{run.deviceId ?? 'Web / 无设备'}</Descriptions.Item>
            <Descriptions.Item label="运行 ID">{run.id}</Descriptions.Item>
            <Descriptions.Item label="错误信息">
              {run.errorMessage ? <Text type="danger">{run.errorMessage}</Text> : '-'}
            </Descriptions.Item>
          </Descriptions>
        ) : (
          <Spin />
        )}
      </Card>

      {run ? (
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={8}>
            <Card title="报告导航">
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                {entries.map((entry) => {
                  const selected = entry.key === selectedEntry?.key;

                  return (
                    <button
                      key={entry.key}
                      type="button"
                      onClick={() => handleSelectEntry(entry.itemId)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        border: `1px solid ${selected ? '#1677ff' : '#d9d9d9'}`,
                        borderRadius: 12,
                        padding: '12px 14px',
                        background: selected ? '#e6f4ff' : '#fff',
                        cursor: 'pointer',
                      }}
                    >
                      <Space direction="vertical" size={4} style={{ width: '100%' }}>
                        <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                          <Text strong>{entry.label}</Text>
                          <Tag color={statusColors[entry.status]}>{statusLabels[entry.status] ?? entry.status}</Tag>
                        </Space>
                        <Text type="secondary">
                          {entry.reportPath ? '已生成原始报告' : '报告尚未生成'}
                        </Text>
                      </Space>
                    </button>
                  );
                })}
              </Space>
            </Card>
          </Col>

          <Col xs={24} lg={16}>
            <Card
              title={selectedEntry?.label ?? '报告内容'}
              extra={
                selectedEntry?.reportPath ? (
                  <Button
                    icon={<LinkOutlined />}
                    onClick={() => window.open(selectedEntry.reportPath, '_blank', 'noopener,noreferrer')}
                  >
                    打开原始报告
                  </Button>
                ) : undefined
              }
            >
              {selectedEntry?.reportPath ? (
                <iframe
                  key={selectedEntry.reportPath}
                  src={selectedEntry.reportPath}
                  title={selectedEntry.label}
                  sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
                  referrerPolicy="no-referrer"
                  style={{
                    width: '100%',
                    minHeight: 760,
                    border: '1px solid #f0f0f0',
                    borderRadius: 12,
                    background: '#fff',
                  }}
                />
              ) : (
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                  <Alert
                    type="info"
                    showIcon
                    message="报告尚未生成"
                    description="当前任务元数据已经可见，但还没有可嵌入的 HTML 报告。"
                  />
                  <Empty description="暂无可展示的报告内容" />
                </Space>
              )}
            </Card>
          </Col>
        </Row>
      ) : null}
    </Space>
  );
}
