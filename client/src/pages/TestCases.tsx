import { useEffect, useState } from 'react';
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
import { testCaseApi, type TestCase } from '../services/api';
import { formatChinaDateTime } from '../utils/datetime';

const { TextArea } = Input;

const platformColors: Record<string, string> = {
  web: 'blue',
  android: 'green',
  ios: 'purple',
};

export default function TestCases() {
  const [cases, setCases] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form] = Form.useForm();

  const fetchCases = async () => {
    setLoading(true);
    try {
      const data = await testCaseApi.list();
      setCases(data);
    } catch {
      // API not connected yet
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCases();
  }, []);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (editingId) {
      await testCaseApi.update(editingId, values);
      message.success('用例已更新');
    } else {
      await testCaseApi.create(values);
      message.success('用例已创建');
    }
    setModalOpen(false);
    setEditingId(null);
    form.resetFields();
    fetchCases();
  };

  const handleEdit = (record: TestCase) => {
    setEditingId(record.id);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    await testCaseApi.delete(id);
    message.success('用例已删除');
    fetchCases();
  };

  const columns = [
    { title: '用例名称', dataIndex: 'name', key: 'name' },
    {
      title: '平台',
      dataIndex: 'platform',
      key: 'platform',
      render: (v: string) => <Tag color={platformColors[v]}>{v.toUpperCase()}</Tag>,
    },
    {
      title: '测试步骤（自然语言）',
      dataIndex: 'steps',
      key: 'steps',
      ellipsis: true,
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
      render: (_: unknown, record: TestCase) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Popconfirm title="确认删除?" onConfirm={() => handleDelete(record.id)}>
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
        title="测试用例管理"
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
            新建用例
          </Button>
        }
      >
        <Table
          dataSource={cases}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal
        title={editingId ? '编辑用例' : '新建用例'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => {
          setModalOpen(false);
          setEditingId(null);
        }}
        okText="保存"
        cancelText="取消"
        width={640}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="用例名称" rules={[{ required: true, message: '请输入用例名称' }]}>
            <Input placeholder="例如：登录功能测试" />
          </Form.Item>
          <Form.Item name="platform" label="目标平台" rules={[{ required: true, message: '请选择平台' }]}>
            <Select
              placeholder="选择平台"
              options={[
                { value: 'web', label: 'Web' },
                { value: 'android', label: 'Android' },
                { value: 'ios', label: 'iOS' },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="steps"
            label="测试步骤（自然语言描述）"
            rules={[{ required: true, message: '请输入测试步骤' }]}
          >
            <TextArea
              rows={8}
              placeholder={`用自然语言描述测试步骤，每行一步，例如：
1. 打开 Bing 首页
2. 点击搜索框
3. 输入 Midscene.js
4. 点击搜索按钮，并等待进入 Midscene.js 搜索结果页
5. 断言搜索关键词为 Midscene.js，且至少显示一条相关结果`}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
