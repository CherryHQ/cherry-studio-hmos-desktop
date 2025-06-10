import { InfoCircleOutlined } from '@ant-design/icons'
import { Alert, Space, Typography } from 'antd'
import React from 'react'
import styled from 'styled-components'

const { Text, Link } = Typography

interface LocalLLMGuideProps {
  modelId?: string
  error?: string
}

/**
 * 本地LLM模型使用指南组件
 * 提供Ollama和本地模型的安装和配置指导
 */
const LocalLLMGuide: React.FC<LocalLLMGuideProps> = ({ modelId = 'llama3.2', error }) => {
  const isError = !!error

  return (
    <GuideContainer>
      <Alert
        type={isError ? 'error' : 'info'}
        icon={<InfoCircleOutlined />}
        showIcon
        message={isError ? <AlertTitle>本地LLM模型连接错误</AlertTitle> : <AlertTitle>本地LLM模型使用指南</AlertTitle>}
        description={
          <Space direction="vertical" size="small">
            {isError ? (
              <Text>
                连接到本地LLM服务器时出现错误: <ErrorText>{error}</ErrorText>
              </Text>
            ) : (
              <Text>
                您选择了本地LLM模型 <ModelName>{modelId}</ModelName>，请确保已正确安装和配置。
              </Text>
            )}

            <Text strong>安装步骤:</Text>

            <StepList>
              <li>
                <Text>
                  1. 安装Ollama: 访问{' '}
                  <Link href="https://ollama.com" target="_blank">
                    ollama.com
                  </Link>{' '}
                  下载并安装
                </Text>
              </li>
              <li>
                <Text>
                  2. 启动Ollama服务: 安装后Ollama会自动启动，或手动运行 <CodeText>ollama serve</CodeText>
                </Text>
              </li>
              <li>
                <Text>
                  3. 下载模型: 打开终端/命令提示符，运行 <CodeText>ollama pull {modelId}</CodeText>
                </Text>
              </li>
            </StepList>

            <Text>首次使用时，模型加载可能需要一些时间，请耐心等待。如果遇到问题，请检查Ollama服务是否正常运行。</Text>
          </Space>
        }
      />
    </GuideContainer>
  )
}

const GuideContainer = styled.div`
  margin: 10px 0;

  .ant-alert {
    border-radius: 8px;
  }
`

const AlertTitle = styled.div`
  font-weight: 500;
  font-size: 14px;
`

const StepList = styled.ul`
  margin: 0;
  padding-left: 20px;
`

const CodeText = styled(Text)`
  background-color: var(--color-background-mute);
  padding: 2px 5px;
  border-radius: 4px;
  font-family: monospace;
`

const ModelName = styled(Text)`
  font-weight: 500;
  color: var(--color-primary);
`

const ErrorText = styled(Text)`
  color: var(--color-error);
`

export default LocalLLMGuide
