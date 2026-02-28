import { useEffect, useState } from 'react';
import { Row, Col, Card, Statistic, Table, Tag } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  PlayCircleOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { testRunApi, testCaseApi, type TestRun, type TestCase } from '../services/api';

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

export default function Dashboard() {
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [cases, setCases] = useState<TestCase[]>([]);

  useEffect(() => {
    testRunApi.list().then(setRuns).catch(() => {});
    testCaseApi.list().then(setCases).catch(() => {});
  }, []);

  const totalCases = cases.length;
  const totalRuns = runs.length;
  const passedRuns = runs.filter((r) => r.status === 'passed').length;
  const failedRuns = runs.filter((r) => r.status === 'failed').length;
  const passRate = totalRuns > 0 ? ((passedRuns / totalRuns) * 100).toFixed(1) : '0';

  const recentRuns = [...runs].reverse().slice(0, 10);

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
    </>
  );
}
