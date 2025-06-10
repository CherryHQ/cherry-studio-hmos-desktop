/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Assistant,
  GenerateImageParams,
  MCPCallToolResponse,
  MCPTool,
  MCPToolResponse,
  Model,
  Suggestion
} from '@renderer/types'
import { Message } from '@renderer/types/newMessage'
import OpenAI from 'openai'

import BaseProvider from './BaseProvider'
import { CompletionsParams } from './index'

/**
 * 本地LLM配置接口
 * @interface LocalLLMConfig
 */
interface LocalLLMConfig {
  /** API基础URL，默认为http://localhost:11434 */
  apiBaseUrl?: string
  /** 默认模型ID，默认为llama3.2 */
  defaultModel?: string
  /** 最大token数量，默认为2000 */
  maxTokens?: number
  /** 温度参数，控制随机性，默认为0.7 */
  temperature?: number
}

/**
 * 日志级别枚举
 */
enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug'
}

/**
 * 本地模型详情接口
 */
interface LocalModelDetails {
  format: string
  family: string
  families: string[] | null
  parameter_size: string
  quantization_level: string
}

/**
 * 本地模型信息接口
 */
interface LocalModel {
  name: string
  version: string
  status: 'downloaded' | 'undownloaded' | 'downloading' | 'paused' | 'failed'
  modified_at: string
  size: number
  completed: number
  digest: string
  details: LocalModelDetails
}

/**
 * 本地LLM响应接口
 * @interface LocalLLMResponse
 */
interface LocalLLMResponse {
  /** 模型名称 */
  model?: string
  /** 创建时间 */
  created_at?: string
  /** 消息对象 */
  message?: {
    /** 角色 */
    role: string
    /** 内容 */
    content: string
  }
  /** 旧版API的响应文本 */
  response?: string
  /** 错误信息 */
  error?: string
  /** 是否完成 */
  done?: boolean
  /** 总处理时间（纳秒） */
  total_duration?: number
  /** 加载时间（纳秒） */
  load_duration?: number
  /** 提示评估计数 */
  prompt_eval_count?: number
  /** 提示评估时间（纳秒） */
  prompt_eval_duration?: number
  /** 评估计数 */
  eval_count?: number
  /** 评估时间（纳秒） */
  eval_duration?: number
}

/**
 * LocalLLMProvider - 用于处理本地大模型的Provider
 *
 * 该Provider实现了与本地运行的LLM服务的通信，支持：
 * - 健康检查
 * - 模型列表获取
 * - 流式对话补全
 * - 配置化管理
 *
 * @example
 * ```typescript
 * const provider = new LocalLLMProvider({
 *   apiBaseUrl: 'http://localhost:11434',
 *   defaultModel: 'local-llm',
 *   maxTokens: 2000,
 *   temperature: 0.7
 * });
 * ```
 */
export default class LocalLLMProvider extends BaseProvider {
  summaries(_messages: Message[], _assistant: Assistant): Promise<string> {
    throw new Error('Method not implemented.')
  }
  summaryForSearch(_messages: Message[], _assistant: Assistant): Promise<string | null> {
    throw new Error('Method not implemented.')
  }
  suggestions(_messages: Message[], _assistant: Assistant): Promise<Suggestion[]> {
    throw new Error('Method not implemented.')
  }
  generateText(): Promise<string> {
    throw new Error('Method not implemented.')
  }
  generateImage(_params: GenerateImageParams): Promise<string[]> {
    throw new Error('Method not implemented.')
  }
  generateImageByChat(): Promise<void> {
    throw new Error('Method not implemented.')
  }
  getEmbeddingDimensions(_model: Model): Promise<number> {
    throw new Error('Method not implemented.')
  }
  public convertMcpTools<T>(_mcpTools: MCPTool[]): T[] {
    throw new Error('Method not implemented.')
  }
  public mcpToolCallResponseToMessage(_mcpToolResponse: MCPToolResponse, _resp: MCPCallToolResponse, _model: Model) {
    throw new Error('Method not implemented.')
  }
  private readonly config: LocalLLMConfig

  /**
   * 创建LocalLLMProvider实例
   * @param provider 基础Provider配置
   * @param config 本地LLM配置
   */
  constructor(provider: any, config: LocalLLMConfig = {}) {
    super(provider)

    // 初始化配置
    this.config = {
      apiBaseUrl: config.apiBaseUrl || 'http://localhost:11434',
      defaultModel: config.defaultModel || 'llama3.2',
      maxTokens: config.maxTokens || 2000,
      temperature: config.temperature || 0.7
    }

    this.log(LogLevel.INFO, 'LocalLLM provider initialized with config:', {
      apiBaseUrl: this.config.apiBaseUrl,
      defaultModel: this.config.defaultModel,
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature
    })
  }

  /**
   * 检查模型是否可用
   * @param modelId 模型ID
   * @returns Promise<boolean> 模型是否可用
   */
  private async checkModelAvailability(modelId: string): Promise<boolean> {
    try {
      this.log(LogLevel.INFO, `Checking if model '${modelId}' is available...`)

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000) // 5秒超时

      const response = await fetch(`${this.config.apiBaseUrl}/api/tags`, {
        method: 'GET',
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`获取模型列表失败: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      if (!data.models || !Array.isArray(data.models)) {
        throw new Error('无效的模型列表响应')
      }

      const modelExists = data.models.some((model: LocalModel) => model.name === modelId)

      if (!modelExists) {
        this.log(LogLevel.WARN, `模型 '${modelId}' 不可用，请使用 'ollama pull ${modelId}' 命令下载`)
        return false
      }

      this.log(LogLevel.INFO, `模型 '${modelId}' 可用`)
      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.log(LogLevel.ERROR, `模型可用性检查失败: ${errorMessage}`)
      return false
    }
  }

  /**
   * 检查指定模型是否可用
   *
   * 通过向本地LLM服务发送简单的聊天请求来验证服务和模型是否正常运行。
   *
   * @param model - 要检查的模型信息
   * @param _stream - 是否使用流式模式（当前未使用）
   * @returns 包含验证结果和可能的错误信息的对象
   *
   * @example
   * ```typescript
   * const result = await provider.check({ id: 'local-llm' });
   * if (result.valid) {
   *   console.log('模型可用');
   * } else {
   *   console.error('模型不可用:', result.error);
   * }
   * ```
   */
  /**
   * 检查指定模型是否可用
   * @param model - 要检查的模型信息
   * @returns 包含验证结果和可能的错误信息的对象
   */
  public async check(model: Model): Promise<{ valid: boolean; error: Error | null }> {
    try {
      // 设置请求超时
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10秒超时

      const response = await fetch(`${this.config.apiBaseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model.id,
          messages: [{ role: 'user', content: 'test' }],
          stream: false
        }),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`Service check failed: ${response.status} ${response.statusText}`)
      }

      const data = (await response.json()) as LocalLLMResponse

      // 只需验证响应格式是否正确
      if (!data.message?.content) {
        throw new Error('Invalid response format')
      }

      return { valid: true, error: null }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return { valid: false, error: new Error(errorMessage) }
    }
  }

  /**
   * 获取可用模型列表
   *
   * 从本地LLM服务获取所有可用模型，并将其转换为标准的OpenAI模型格式。
   * 如果无法获取模型列表或发生错误，将返回默认模型。
   *
   * @returns 可用模型列表，格式与OpenAI API兼容
   *
   * @example
   * ```typescript
   * const models = await provider.models();
   * console.log('可用模型:', models);
   * // 输出: [{ id: 'local-model-1', created: 1234567890, object: 'model', owned_by: 'local' }, ...]
   * ```
   */
  /**
   * 获取可用模型列表
   *
   * 从本地LLM服务获取所有可用模型，并将其转换为标准的OpenAI模型格式。
   * 如果无法获取模型列表或发生错误，将返回默认模型。
   *
   * @returns 可用模型列表，格式与OpenAI API兼容
   */
  /**
   * 获取可用模型列表
   * @returns 可用模型列表，格式与OpenAI API兼容
   */
  public async models(): Promise<OpenAI.Models.Model[]> {
    try {
      // 添加超时控制
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10秒超时

      const response = await fetch(`${this.config.apiBaseUrl}/api/tags`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status}`)
      }

      const data = await response.json()

      if (!data.models || !Array.isArray(data.models)) {
        return [this.getDefaultModel()]
      }

      // 转换为OpenAI.Models.Model格式
      const modelList = data.models.map((model: LocalModel) => ({
        id: model.name,
        created: model.modified_at ? new Date(model.modified_at).getTime() : Date.now(),
        object: 'model',
        owned_by: 'local',
        custom_properties: {
          status: model.status,
          version: model.version,
          size: model.size,
          completed: model.completed,
          details: model.details,
          progress: model.size > 0 ? Math.round((model.completed / model.size) * 100) : 0
        }
      }))

      return modelList.length > 0 ? modelList : [this.getDefaultModel()]
    } catch (error) {
      // 出错时返回默认模型
      return [this.getDefaultModel()]
    }
  }

  /**
   * 获取默认模型配置
   * @returns OpenAI.Models.Model 默认模型配置
   */
  private getDefaultModel(): OpenAI.Models.Model {
    return {
      id: this.config.defaultModel,
      created: Date.now(),
      object: 'model',
      owned_by: 'local',
      custom_properties: {
        status: 'unknown',
        version: '1.0',
        size: 0,
        completed: 0,
        progress: 0,
        details: {
          format: 'unknown',
          family: 'unknown',
          families: null,
          parameter_size: 'unknown',
          quantization_level: 'unknown'
        }
      }
    }
  }

  /**
   * 处理网络错误
   * @param error - 捕获的错误
   * @returns void
   */
  private handleNetworkError(error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    if (errorMessage === 'Failed to fetch') {
      console.error(`Unable to connect to LLM server at ${this.config.apiBaseUrl}`)
    } else if (errorMessage.includes('abort')) {
      console.error('Request timeout - Server took too long to respond')
    } else {
      console.error('Network request failed:', errorMessage)
    }
  }

  /**
   * 处理流式响应数据
   * @param line - JSON行数据
   * @param onResponse - 响应回调函数
   * @param isFirstChunk - 是否是第一个数据块
   * @returns {processed: boolean, tokens: number} - 处理结果和token数量
   */
  /**
   * 处理流式响应数据
   * @param line - JSON行数据
   * @param onResponse - 响应回调函数
   * @param isFirstChunk - 是否是第一个数据块
   * @returns 处理结果和token数量
   */
  /**
   * 过滤掉思考标签及其内容
   * @param content - 原始内容
   * @returns 过滤后的内容
   */
  private filterThinkingContent(content: string): string {
    // 移除<thinking>...</thinking>标签及其内容
    return content.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim()
  }

  /**
   * 处理流式响应数据
   * @param line - JSON行数据
   * @param onResponse - 响应回调函数
   * @param isFirstChunk - 是否是第一个数据块
   * @returns 处理结果和token数量
   */
  private handleStreamLine(
    line: string,
    onResponse: ((text: string, done: boolean) => void) | undefined,
    isFirstChunk: boolean
  ): { processed: boolean; tokens: number } {
    if (!line.trim()) {
      return { processed: false, tokens: 0 }
    }

    try {
      const data = JSON.parse(line) as LocalLLMResponse

      if (data.error) {
        throw new Error(data.error)
      }

      // 如果是最后一个响应，标记完成
      if (data.done) {
        if (onResponse) {
          onResponse('', true) // 标记流式响应结束
        }
        return { processed: true, tokens: 0 }
      }

      // 处理响应内容
      if (onResponse && data.message?.content) {
        const content = data.message.content
        // 过滤思考标签内容
        const filteredContent = this.filterThinkingContent(content)

        if (filteredContent) {
          const responseText = isFirstChunk ? ` ${filteredContent}` : filteredContent
          onResponse(responseText, false)
          return { processed: true, tokens: responseText.length }
        }
      }

      return { processed: false, tokens: 0 }
    } catch (e) {
      return { processed: false, tokens: 0 }
    }
  }

  /**
   * 记录日志
   * @param level - 日志级别
   * @param message - 日志消息
   * @param args - 额外参数
   */
  /**
   * 记录日志
   * @param level - 日志级别（WARN 或 ERROR）
   * @param message - 日志消息
   * @param args - 额外参数
   */
  private log(level: LogLevel, message: string, ...args: any[]): void {
    const prefix = `[LocalLLM]`
    const timestamp = new Date().toISOString()

    switch (level) {
      case LogLevel.DEBUG:
        console.debug(`${timestamp} ${prefix} [DEBUG]`, message, ...args)
        break
      case LogLevel.INFO:
        console.info(`${timestamp} ${prefix} [INFO]`, message, ...args)
        break
      case LogLevel.WARN:
        console.warn(`${timestamp} ${prefix} [WARN]`, message, ...args)
        break
      case LogLevel.ERROR:
        console.error(`${timestamp} ${prefix} [ERROR]`, message, ...args)
        break
    }
  }

  /**
   * 执行对话补全
   */
  /**
   * 执行对话补全
   *
   * 将消息发送到本地LLM服务并处理流式响应。
   * 支持错误处理和完成回调。
   *
   * @param params - 补全参数，包含消息、回调函数和助手配置
   * @returns Promise<void>
   */
  public async completions(params: CompletionsParams): Promise<void> {
    const { messages, onResponse, assistant } = params

    try {
      this.log(LogLevel.INFO, 'Starting local LLM completion...')

      // 1. 准备请求数据
      const modelId = assistant.model?.id || this.config.defaultModel

      this.log(LogLevel.INFO, 'Using model:', modelId)
      this.log(LogLevel.DEBUG, 'Request parameters:', {
        modelId,
        temperature: this.config.temperature,
        maxTokens: this.config.maxTokens,
        messagesCount: messages.length
      })

      // 3. 准备请求
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 100000) // 100秒超时

      // 4. 调用本地模型API
      // Ollama API格式：
      // {
      //   "model": "llama3.2",
      //   "messages": [
      //     {
      //       "role": "user",
      //       "content": "why is the sky blue?"
      //     },
      //     {
      //       "role": "assistant",
      //       "content": "due to rayleigh scattering."
      //     }
      //   ],
      //   "stream": true
      // }
      const response = await fetch(`${this.config.apiBaseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          model: modelId,
          messages: messages.map((m) => ({
            role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user',
            content: typeof m.content === 'string' ? m.content : this.processMessageContent(m.content)
          })),
          stream: true,
          ...(this.config.temperature && { temperature: this.config.temperature }),
          ...(this.config.maxTokens && { max_tokens: this.config.maxTokens })
        }),
        signal: controller.signal
      }).catch((error) => {
        if (error.name === 'AbortError') {
          throw new Error(`请求超时: 本地LLM服务器响应时间过长`)
        }
        throw error
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText)

        // 解析错误信息，提供更友好的错误提示
        let userFriendlyError = `本地LLM API错误 (${response.status}): ${errorText}`

        if (errorText.includes('model not found')) {
          userFriendlyError = `模型 "${modelId}" 未找到。请使用 "ollama pull ${modelId}" 命令下载该模型。`
        } else if (response.status === 404) {
          userFriendlyError = `API端点不存在。请确保Ollama服务正在运行且API路径正确。`
        } else if (response.status === 500) {
          userFriendlyError = `服务器内部错误。请检查Ollama服务日志以获取更多信息。`
        }

        this.log(LogLevel.ERROR, userFriendlyError, { status: response.status, errorText })

        if (onResponse) {
          onResponse(`错误: ${userFriendlyError}`, true)
        }

        throw new Error(userFriendlyError)
      }

      // 4. 处理流式响应
      if (!response.body) {
        throw new Error('Response body is empty')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let isFirstChunk = true
      let totalTokens = 0
      let noResponseTimeout: NodeJS.Timeout | null = null
      let lastResponseTime = Date.now()

      // 设置无响应超时检测
      const setupNoResponseTimeout = () => {
        if (noResponseTimeout) {
          clearTimeout(noResponseTimeout)
        }

        noResponseTimeout = setTimeout(() => {
          const timeSinceLastResponse = Date.now() - lastResponseTime
          this.log(LogLevel.WARN, `No response from model for ${timeSinceLastResponse / 1000} seconds`, {
            model: modelId
          })

          if (onResponse) {
            onResponse('\n\n[注意: 模型响应较慢，可能是因为模型加载或处理复杂查询需要更多时间。请耐心等待...]', false)
          }

          // 重新设置超时检测
          setupNoResponseTimeout()
        }, 15000) // 15秒无响应则提示用户
      }

      setupNoResponseTimeout()

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            this.log(LogLevel.INFO, 'Stream completed', { totalTokens })
            break
          }

          // 更新最后响应时间
          lastResponseTime = Date.now()

          const chunk = decoder.decode(value)
          buffer += chunk

          // 尝试解析完整的JSON对象
          while (buffer.includes('\n')) {
            const newlineIndex = buffer.indexOf('\n')
            const line = buffer.slice(0, newlineIndex)
            buffer = buffer.slice(newlineIndex + 1)

            const result = this.handleStreamLine(line, onResponse, isFirstChunk)
            if (result.processed) {
              isFirstChunk = false
              totalTokens += result.tokens
            }

            // 检查是否收到完成信号
            try {
              const data = JSON.parse(line) as LocalLLMResponse
              if (data.done) {
                this.log(LogLevel.DEBUG, 'Received done signal')
                break
              }

              // 检查是否有错误信息
              if (data.error) {
                this.log(LogLevel.ERROR, 'Error in stream response', { error: data.error })
                if (onResponse) {
                  onResponse(`\n\n[错误: ${data.error}]`, false)
                }
              }
            } catch (e) {
              // 解析错误已在handleStreamLine中处理
            }
          }
        }

        // 处理剩余的buffer
        if (buffer.trim() && onResponse) {
          try {
            const data = JSON.parse(buffer) as LocalLLMResponse
            if (data.response) {
              onResponse(data.response, false)
              totalTokens += data.response.length
            }
            if (data.error) {
              this.log(LogLevel.ERROR, 'Error in final chunk', { error: data.error })
              onResponse(`\n\n[错误: ${data.error}]`, false)
              throw new Error(data.error)
            }
          } catch (e) {
            this.log(LogLevel.WARN, 'Failed to parse final chunk:', { buffer, error: e })
          }
        }

        // 清除无响应超时检测
        if (noResponseTimeout) {
          clearTimeout(noResponseTimeout)
          noResponseTimeout = null
        }
      } catch (streamError) {
        this.log(LogLevel.ERROR, 'Error processing stream:', streamError)
        throw streamError
      } finally {
        // 确保在所有情况下都会调用完成回调
        if (onResponse) {
          onResponse('', true)
        }
        this.log(LogLevel.INFO, 'Completion finished', { totalTokens })
      }
    } catch (error) {
      this.handleNetworkError(error)
      if (onResponse) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
        onResponse(`Error: ${errorMessage}`, true)
      }
      throw error
    }
  }

  /**
   * 转换消息为提示词
   */
  /**
   * 处理消息内容，支持多模态内容
   * @param content - 消息内容
   * @param options - 处理选项
   * @returns 处理后的文本内容
   */
  /**
   * 处理消息内容，支持文本和图片内容
   * @param content 消息内容
   * @returns 处理后的文本内容
   */
  private processMessageContent(
    content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>
  ): string {
    // 如果是字符串，直接返回
    if (typeof content === 'string') {
      return content.trim()
    }

    // 如果是数组，处理多模态内容
    if (Array.isArray(content)) {
      return content
        .map((item) => {
          if (item.type === 'text' && item.text) {
            return item.text.trim()
          }
          if (item.type === 'image_url') {
            return '[图片]'
          }
          return ''
        })
        .filter(Boolean)
        .join('\n')
    }

    return ''
  }

  /**
   * 翻译文本内容
   * @param content - 要翻译的内容
   * @param assistant - 助手配置
   * @param onResponse - 响应回调函数，用于流式输出
   * @returns 翻译后的文本
   */
  public async translate(
    content: string,
    assistant: any,
    onResponse?: (text: string, isComplete: boolean) => void
  ): Promise<string> {
    try {
      this.log(LogLevel.INFO, 'Starting translation...')

      // 准备消息
      const messages = content
        ? [
            { role: 'system', content: assistant.prompt },
            { role: 'user', content }
          ]
        : [{ role: 'user', content: assistant.prompt }]

      // 准备请求参数
      const modelId = assistant.model?.id || this.config.defaultModel
      const useStream = !!onResponse // 如果有onResponse回调则使用流式响应

      this.log(LogLevel.DEBUG, 'Translation request:', {
        modelId,
        hasContent: !!content,
        useStream
      })

      // 发送请求
      const response = await fetch(`${this.config.apiBaseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: modelId,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content
          })),
          stream: useStream,
          temperature: this.config.temperature,
          ...(this.config.maxTokens && { max_tokens: this.config.maxTokens })
        })
      })

      if (!response.ok) {
        throw new Error(`Translation request failed: ${response.statusText}`)
      }

      // 处理非流式响应
      if (!useStream) {
        const data = (await response.json()) as LocalLLMResponse
        const content = data.message?.content || ''
        // 过滤掉思考标签及其内容
        return this.filterThinkingContent(content)
      }

      // 处理流式响应
      if (!response.body) {
        throw new Error('Response body is empty')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let translatedText = ''
      let isThinking = false // 用于跟踪是否在思考标签内

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            break
          }

          const chunk = decoder.decode(value)
          buffer += chunk

          // 处理完整的JSON行
          while (buffer.includes('\n')) {
            const newlineIndex = buffer.indexOf('\n')
            const line = buffer.slice(0, newlineIndex)
            buffer = buffer.slice(newlineIndex + 1)

            if (!line.trim()) continue

            try {
              const data = JSON.parse(line) as LocalLLMResponse

              if (data.error) {
                throw new Error(data.error)
              }

              if (data.done) {
                onResponse?.(translatedText, true)
                continue
              }

              if (data.message?.content) {
                const content = data.message.content

                // 处理思考标签
                if (content.includes('<think>')) {
                  isThinking = true
                  this.log(LogLevel.DEBUG, 'Entering thinking mode')
                }

                if (!isThinking) {
                  translatedText += content
                  onResponse?.(translatedText, false)
                } else {
                  this.log(LogLevel.DEBUG, 'Skipping thinking content: ' + content)
                }

                if (content.includes('</think>')) {
                  isThinking = false
                  this.log(LogLevel.DEBUG, 'Exiting thinking mode')
                }
              }
            } catch (e) {
              this.log(LogLevel.WARN, 'Failed to parse stream line:', { line, error: e })
            }
          }
        }

        // 处理剩余的buffer
        if (buffer.trim()) {
          try {
            const data = JSON.parse(buffer) as LocalLLMResponse
            if (data.message?.content) {
              translatedText += data.message.content
              onResponse?.(translatedText, false)
            }
          } catch (e) {
            this.log(LogLevel.WARN, 'Failed to parse final chunk:', { buffer, error: e })
          }
        }

        onResponse?.(translatedText, true)
        return translatedText
      } catch (streamError) {
        this.log(LogLevel.ERROR, 'Error processing translation stream:', streamError)
        throw streamError
      }
    } catch (error) {
      this.handleNetworkError(error)
      throw error
    }
  }

  /**
   * 过滤掉思考标签及其内容
   * @param content 原始内容
   * @returns 过滤后的内容
   */
  private filterThinkingContent(content: string): string {
    let result = ''
    let isThinking = false

    // 按行处理，以确保不会错过标签
    const lines = content.split('\n')

    for (const line of lines) {
      if (line.includes('<think>')) {
        isThinking = true
        continue
      }

      if (!isThinking) {
        result += line + '\n'
      }

      if (line.includes('</think>')) {
        isThinking = false
      }
    }

    return result.trim()
  }
}
