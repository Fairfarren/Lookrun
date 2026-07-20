import { yaml } from '@codemirror/lang-yaml';
import CodeMirror from '@uiw/react-codemirror';
import { App as AntApp, Alert, Button, Card, Input, Space, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';

const YAML_TEMPLATE = `target: https://example.com
# viewportWidth: 1280
# viewportHeight: 800

tasks:
  - name: 登录
    flow:
      - aiInput:
          locate: 用户名输入框
          value: "{{USERNAME}}"
      - aiInput:
          locate: 密码输入框
          value: "{{PASSWORD}}"
      - aiTap: 登录按钮
      - aiWaitFor: 页面跳转到首页
        timeout: 10000

  - name: 验证结果
    flow:
      - aiAssert: 页面显示登录成功
`;

const VALIDATE_DEBOUNCE_MS = 800;

export default function TaskEditPage() {
  const { id } = useParams();
  const isNew = id === undefined || id === 'new';
  const { message } = AntApp.useApp();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [yamlText, setYamlText] = useState(YAML_TEMPLATE);
  const [errors, setErrors] = useState<string[]>([]);
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(isNew);
  const validateTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!isNew) {
      api
        .getTask(Number(id))
        .then((task) => {
          setName(task.name);
          setYamlText(task.yaml);
          setLoaded(true);
        })
        .catch((error: Error) => message.error(error.message));
    }
  }, [id]);

  // 编辑停顿后自动调后端校验（变量表也在后端，校验结果含变量检查）
  useEffect(() => {
    if (!loaded) {
      return;
    }
    clearTimeout(validateTimer.current);
    validateTimer.current = setTimeout(() => {
      setValidating(true);
      api
        .validateYaml(yamlText)
        .then((result) => setErrors(result.errors))
        .catch(() => setErrors([]))
        .finally(() => setValidating(false));
    }, VALIDATE_DEBOUNCE_MS);
    return () => clearTimeout(validateTimer.current);
  }, [yamlText, loaded]);

  const save = async () => {
    if (!name.trim()) {
      message.warning('请填写任务名');
      return;
    }
    setSaving(true);
    try {
      const result = await api.validateYaml(yamlText);
      if (!result.ok) {
        setErrors(result.errors);
        message.error('脚本校验未通过，请先修复错误');
        return;
      }
      if (isNew) {
        await api.createTask({ name: name.trim(), yaml: yamlText });
      } else {
        await api.updateTask(Number(id), { name: name.trim(), yaml: yamlText });
      }
      message.success('已保存');
      navigate('/tasks');
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title={isNew ? '新建任务' : '编辑任务'}
      extra={
        <Space>
          <Button onClick={() => navigate('/tasks')}>返回</Button>
          <Button type="primary" loading={saving} onClick={save}>
            保存
          </Button>
        </Space>
      }
    >
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        <div>
          <Typography.Text strong>任务名</Typography.Text>
          <Input style={{ marginTop: 8 }} placeholder="例如：登录冒烟测试" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Typography.Text strong>任务脚本（YAML）</Typography.Text>
          <Typography.Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 8 }}>
            支持动作：ai / aiTap / aiHover / aiRightClick / aiInput / aiAssert / aiWaitFor / aiQuery / aiKeyboardPress /
            aiScroll / sleep；变量用 {'{{变量名}}'} 引用，在「设置-变量」中配置。
          </Typography.Paragraph>
          <CodeMirror
            value={yamlText}
            height="420px"
            extensions={[yaml()]}
            onChange={setYamlText}
            basicSetup={{ lineNumbers: true, foldGutter: true }}
          />
        </div>
        {validating && <Alert type="info" title="校验中..." showIcon />}
        {!validating && errors.length > 0 && (
          <Alert
            type="error"
            title="脚本存在问题"
            description={
              <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            }
          />
        )}
        {!validating && errors.length === 0 && yamlText.trim() !== '' && <Alert type="success" title="校验通过" showIcon />}
      </Space>
    </Card>
  );
}
