import { useEffect, useMemo, useState } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Space,
  Tag,
  Popconfirm,
  message,
} from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { testCaseApi, testSuiteApi, type TestCase, type TestSuite } from '../services/api';
import { formatChinaDateTime } from '../utils/datetime';

const platformColors: Record<string, string> = {
  web: 'blue',
  android: 'green',
  ios: 'purple',
};

export default function TestSuites() {
  const [suites, setSuites] = useState<TestSuite[]>([]);
  const [cases, setCases] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm<{ name: string; testCaseIds: string[] }>();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [suiteData, caseData] = await Promise.all([testSuiteApi.list(), testCaseApi.list()]);
      setSuites(suiteData);
      setCases(caseData);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const selectedCaseIds = Form.useWatch('testCaseIds', form) ?? [];
  const selectedCases = useMemo(
    () => cases.filter((item) => selectedCaseIds.includes(item.id)),
    [cases, selectedCaseIds],
  );
  const selectedPlatform = selectedCases[0]?.platform;

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (editingId) {
      await testSuiteApi.update(editingId, values);
      message.success('测试套件已更新');
    } else {
      await testSuiteApi.create(values);
      message.success('测试套件已创建');
    }
    setModalOpen(false);
    setEditingId(null);
    form.resetFields();
    fetchData();
  };

  const handleEdit = (record: TestSuite) => {
    setEditingId(record.id);
    form.setFieldsValue({
      name: record.name,
      testCaseIds: record.testCaseIds,
    });
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    await testSuiteApi.delete(id);
    message.success('测试套件已删除');
    fetchData();
  };

  const columns = [
    { title: '套件名称', dataIndex: 'name', key: 'name' },
    {
      title: '平台',
      dataIndex: 'platform',
      key: 'platform',
      render: (value: string) => <Tag color={platformColors[value]}>{value.toUpperCase()}</Tag>,
    },
    {
      title: '包含用例',
      dataIndex: 'testCases',
      key: 'testCases',
      render: (testCases: TestCase[]) =>
        testCases.length > 0 ? testCases.map((item) => item.name).join('、') : '-',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (value: string) => formatChinaDateTime(value),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: unknown, record: TestSuite) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Popconfirm title="确认删除该测试套件?" onConfirm={() => handleDelete(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Card
        title="测试套件管理"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingId(null);
              form.resetFields();
              setModalOpen(true);
            }}
          >
            新建套件
          </Button>
        }
      >
        <Table
          dataSource={suites}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal
        title={editingId ? '编辑测试套件' : '新建测试套件'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => {
          setModalOpen(false);
          setEditingId(null);
        }}
        okText="保存"
        cancelText="取消"
        width={720}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="套件名称" rules={[{ required: true, message: '请输入测试套件名称' }]}>
            <Input placeholder="例如：Web 搜索回归套件" />
          </Form.Item>
          <Form.Item
            name="testCaseIds"
            label="选择测试用例"
            rules={[
              { required: true, message: '请选择至少一个测试用例' },
              {
                validator: async (_, value: string[] | undefined) => {
                  const ids = value ?? [];
                  if (ids.length === 0) {
                    throw new Error('请选择至少一个测试用例');
                  }
                  const platforms = new Set(cases.filter((item) => ids.includes(item.id)).map((item) => item.platform));
                  if (platforms.size > 1) {
                    throw new Error('同一个测试套件中的测试用例必须属于同一平台');
                  }
                },
              },
            ]}
          >
            <Select
              mode="multiple"
              placeholder="按顺序选择套件中的测试用例"
              options={cases.map((item) => ({
                value: item.id,
                label: `${item.name} (${item.platform.toUpperCase()})`,
              }))}
            />
          </Form.Item>
          <Form.Item label="套件平台">
            <Input value={selectedPlatform ? selectedPlatform.toUpperCase() : '未选择'} readOnly />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
