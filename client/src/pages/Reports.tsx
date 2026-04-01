import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Empty, Popconfirm, Table, Tag, message } from 'antd';
import { DeleteOutlined, EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import { testRunApi, type TestRun, type TestRunItem } from '../services/api';
import { useSSE } from '../hooks/useSSE';
import { formatChinaDateTime } from '../utils/datetime';

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

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    try {
      const data = await testRunApi.list();
      setRuns(data.filter((run) => ['passed', 'failed', 'error'].includes(run.status)));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  useSSE({
    events: {
      'test-run:updated': (data) => {
        const updated = data as TestRun;
        if (['passed', 'failed', 'error'].includes(updated.status)) {
          setRuns((prev) => {
            const exists = prev.some((item) => item.id === updated.id);
            if (exists) {
              return prev.map((item) => (item.id === updated.id ? updated : item));
            }
            return [updated, ...prev];
          });
        }
      },
      'test-run:deleted': (data) => {
        const deleted = data as { id: string };
        setRuns((prev) => prev.filter((item) => item.id !== deleted.id));
      },
      reconnect: () => {
        fetchRuns();
      },
    },
  });

  const handleDelete = async (id: string) => {
    try {
      await testRunApi.delete(id);
      setRuns((prev) => prev.filter((item) => item.id !== id));
      message.success('测试报告已删除');
    } catch {
      message.error('删除测试报告失败');
    }
  };

  const columns = [
    { title: '套件名称', dataIndex: 'suiteName', key: 'suiteName' },
    {
      title: '平台',
      dataIndex: 'platform',
      key: 'platform',
      render: (value: string) => value.toUpperCase(),
    },
    {
      title: '结果',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => <Tag color={statusColors[status]}>{statusLabels[status] ?? status}</Tag>,
    },
    {
      title: '用例数',
      key: 'itemCount',
      render: (_: unknown, record: TestRun) => record.items.length,
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
      title: '套件报告',
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
    {
      title: '操作',
      key: 'actions',
      render: (_: unknown, record: TestRun) => (
        <Popconfirm
          title="确认删除这条测试报告?"
          onConfirm={() => handleDelete(record.id)}
          okText="删除"
          cancelText="取消"
        >
          <Button size="small" danger icon={<DeleteOutlined />}>
            删除
          </Button>
        </Popconfirm>
      ),
    },
  ];

  const itemColumns = [
    { title: '用例名称', dataIndex: 'testCaseName', key: 'testCaseName' },
    {
      title: '结果',
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
      title: '报告',
      key: 'report',
      render: (_: unknown, record: TestRunItem) =>
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
          dataSource={runs}
          columns={columns}
          rowKey="id"
          loading={loading}
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
      ) : (
        <Empty description="暂无测试报告，请先执行测试套件" />
      )}
    </Card>
  );
}
