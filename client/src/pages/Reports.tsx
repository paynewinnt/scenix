import { useEffect, useState } from 'react';
import { Card, Table, Tag, Button, Empty } from 'antd';
import { EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import { testRunApi, type TestRun } from '../services/api';

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

export default function Reports() {
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRuns = async () => {
    setLoading(true);
    try {
      const data = await testRunApi.list();
      setRuns(data.filter((r) => r.status === 'passed' || r.status === 'failed'));
    } catch {
      // API not available
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, []);

  const columns = [
    { title: '用例名称', dataIndex: 'testCaseName', key: 'testCaseName' },
    { title: '平台', dataIndex: 'platform', key: 'platform', render: (v: string) => v.toUpperCase() },
    {
      title: '结果',
      dataIndex: 'status',
      key: 'status',
      render: (s: string) => <Tag color={statusColors[s]}>{statusLabels[s] ?? s}</Tag>,
    },
    { title: '开始时间', dataIndex: 'startedAt', key: 'startedAt' },
    { title: '结束时间', dataIndex: 'finishedAt', key: 'finishedAt', render: (v?: string) => v ?? '-' },
    {
      title: '报告',
      key: 'report',
      render: (_: unknown, record: TestRun) =>
        record.reportPath ? (
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => window.open(record.reportPath, '_blank')}
          >
            查看报告
          </Button>
        ) : (
          '-'
        ),
    },
  ];

  return (
    <Card
      title="测试报告"
      extra={
        <Button icon={<ReloadOutlined />} onClick={fetchRuns}>
          刷新
        </Button>
      }
    >
      {runs.length > 0 ? (
        <Table
          dataSource={[...runs].reverse()}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 15 }}
        />
      ) : (
        <Empty description="暂无测试报告，请先执行测试用例" />
      )}
    </Card>
  );
}
