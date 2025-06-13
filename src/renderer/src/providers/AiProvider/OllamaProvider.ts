/* eslint-disable @typescript-eslint/no-unused-vars */
import { TRANSLATE_PROMPT } from '@renderer/config/prompts'
import {
  Assistant,
  GenerateImageParams,
  MCPCallToolResponse,
  MCPTool,
  MCPToolResponse,
  Model,
  Suggestion
} from '@renderer/types'
import { ChunkType } from '@renderer/types/chunk'
import { Message } from '@renderer/types/newMessage'
import { Ollama } from 'ollama/browser'

import BaseProvider from './BaseProvider'
import { CompletionsParams } from './index'

/**
 * Ollama配置接口
 */
interface OllamaConfig {
  /** API基础URL */
  apiBaseUrl?: string
  /** 默认模型ID */
  defaultModel?: string
  /** 最大token数量 */
  maxTokens?: number
  /** 温度参数 */
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
 * OllamaProvider - 用于处理Ollama模型的Provider
 */
export default class OllamaProvider extends BaseProvider {
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
  summaries(_messages: Message[], _assistant: Assistant): Promise<string> {
    throw new Error('Method not implemented.')
  }
  summaryForSearch(_messages: Message[], _assistant: Assistant): Promise<string | null> {
    throw new Error('Method not implemented.')
  }
  private readonly config: OllamaConfig
  private ollamaClient: Ollama
  private modelDownloadProgress: Map<string, number> = new Map()

  constructor(provider: any, config: OllamaConfig = {}) {
    super(provider)

    this.config = {
      apiBaseUrl: config.apiBaseUrl || 'http://localhost:11434',
      defaultModel: config.defaultModel || 'Ollama',
      maxTokens: config.maxTokens || 2000,
      temperature: config.temperature || 0.7
    }

    this.ollamaClient = new Ollama({
      host: this.config.apiBaseUrl
    })

    this.log(LogLevel.INFO, 'Ollama provider initialized')
  }

  /**
   * 检查指定模型是否可用
   */
  public async check(model: Model): Promise<{ valid: boolean; error: Error | null }> {
    try {
      const modelId = model.id || this.config.defaultModel

      // 检查模型是否正在下载中
      if (this.isModelDownloading(modelId)) {
        return {
          valid: false,
          error: new Error(`Model '${modelId}' is currently downloading (${this.getModelDownloadProgress(modelId)}%)`)
        }
      }

      const response = await this.ollamaClient.list()

      const modelExists = response.models?.some((m) => m.name === modelId)
      if (!modelExists) {
        return {
          valid: false,
          error: new Error(`Model '${modelId}' not found`)
        }
      }

      // 发送测试消息验证模型
      await this.ollamaClient.chat({
        model: modelId,
        messages: [{ role: 'user', content: 'Hello' }],
        stream: false
      })

      return { valid: true, error: null }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return { valid: false, error: new Error(errorMessage) }
    }
  }

  /**
   * 获取可用模型列表
   */
  public async models(): Promise<Model[]> {
    try {
      const response = await this.ollamaClient.list()

      if (!response.models) {
        this.log(LogLevel.WARN, 'No models found in Ollama response')
        return []
      }

      return response.models.map((model) => ({
        id: model.name,
        name: model.name,
        provider: this.provider,
        contextLength: 4096, // 默认上下文长度
        capabilities: {
          chat: true,
          tools: false,
          vision: model.name.toLowerCase().includes('llava'), // LLaVA模型支持视觉功能
          embedding: model.name.toLowerCase().includes('embed') // 包含embed的模型支持嵌入功能
        },
        size: model.size,
        modified_at: model.modified_at,
        digest: model.digest,
        details: {
          format: model.details?.format,
          family: model.details?.family,
          families: model.details?.families,
          parameter_size: model.details?.parameter_size,
          quantization_level: model.details?.quantization_level
        }
      }))
    } catch (error) {
      this.log(LogLevel.ERROR, `Failed to fetch models: ${error}`)
      return []
    }
  }

  /**
   * 执行对话补全
   */
  public async completions(params: CompletionsParams): Promise<void> {
    const { onChunk } = params

    try {
      // 固定的回复消息
      const fixedResponse = '这是一条固定的回复消息，无论您发送什么内容，都会收到这条相同的回复。'

      // 发送块创建事件
      if (onChunk) {
        // 发送块创建事件
        onChunk({
          type: ChunkType.BLOCK_CREATED
        })

        // 发送LLM响应创建事件
        onChunk({
          type: ChunkType.LLM_RESPONSE_CREATED
        })

        // 发送LLM响应进行中事件
        onChunk({
          type: ChunkType.LLM_RESPONSE_IN_PROGRESS
        })
      }

      // 模拟流式响应，一次性发送固定消息
      if (onChunk) {
        onChunk({
          type: ChunkType.TEXT_DELTA,
          text: fixedResponse
        })
      }

      if (params.onResponse) {
        params.onResponse(fixedResponse, false)
      }

      // 短暂延迟，模拟响应完成
      await new Promise((resolve) => setTimeout(resolve, 100))

      // 发送文本完成块
      if (onChunk) {
        onChunk({
          type: ChunkType.TEXT_COMPLETE,
          text: fixedResponse
        })

        // 发送LLM响应完成事件
        onChunk({
          type: ChunkType.LLM_RESPONSE_COMPLETE
        })

        // 发送块完成事件
        onChunk({
          type: ChunkType.BLOCK_COMPLETE
        })
      }

      if (params.onResponse) {
        params.onResponse(fixedResponse, true)
      }
    } catch (error) {
      this.handleNetworkError(error)

      // 发送错误块
      if (onChunk) {
        onChunk({
          type: ChunkType.ERROR,
          error: {
            message: error instanceof Error ? error.message : 'Unknown error',
            type: 'provider_error'
          }
        })
      }

      if (params.onResponse) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        params.onResponse(`Error: ${errorMessage}`, true)
      }

      throw error
    }
  }

  /**
   * 删除Ollama模型
   * @param modelId 要删除的模型ID
   */
  public async deleteModel(modelId: string): Promise<void> {
    try {
      this.log(LogLevel.INFO, `Deleting model '${modelId}'`)
      await this.ollamaClient.delete({
        name: modelId
      })
      this.log(LogLevel.INFO, `Model '${modelId}' deleted successfully`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.log(LogLevel.ERROR, `Failed to delete model '${modelId}': ${errorMessage}`)
      throw error
    }
  }

  /**
   * 获取模型下载状态
   * @returns 返回所有正在下载的模型及其进度
   */
  public getModelDownloadStatus(): Record<string, number> {
    const status: Record<string, number> = {}
    this.modelDownloadProgress.forEach((progress, modelId) => {
      status[modelId] = progress
    })
    return status
  }

  /**
   * 下载Ollama模型
   * @param modelId 模型ID
   * @param onProgress 进度回调函数
   */
  public async downloadModel(modelId: string, onProgress?: (progress: number) => void): Promise<void> {
    try {
      // 如果模型已经在下载中，则返回
      if (this.isModelDownloading(modelId)) {
        this.log(LogLevel.WARN, `Model '${modelId}' is already downloading`)
        return
      }

      this.modelDownloadProgress.set(modelId, 0)
      this.log(LogLevel.INFO, `Starting download of model '${modelId}'`)

      const stream = await this.ollamaClient.pull({
        name: modelId,
        stream: true
      })

      for await (const part of stream) {
        if (part.status) {
          const downloadedStr = part.status.match(/(\d+)%/)?.[1]
          if (downloadedStr) {
            const progress = parseInt(downloadedStr, 10)
            this.modelDownloadProgress.set(modelId, progress)
            this.log(LogLevel.DEBUG, `Download progress for '${modelId}': ${progress}%`)
            if (onProgress) {
              onProgress(progress)
            }
          }
        }
      }

      this.log(LogLevel.INFO, `Model '${modelId}' download completed`)
      this.modelDownloadProgress.delete(modelId)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.log(LogLevel.ERROR, `Failed to download model '${modelId}': ${errorMessage}`)
      this.modelDownloadProgress.delete(modelId)
      throw error
    }
  }

  public async translate(
    content: string,
    assistant: any,
    onResponse?: (text: string, isComplete: boolean) => void
  ): Promise<string> {
    try {
      // 获取目标语言，如果未指定则默认为英语
      const targetLanguage = assistant.targetLanguage || 'English'

      // 替换提示词中的占位符
      let prompt = (assistant.prompt || TRANSLATE_PROMPT).replace(/{{target_language}}/g, targetLanguage)

      // 如果有内容需要翻译，将其包装在<translate_input>标签中并替换{{text}}占位符
      if (content) {
        prompt = prompt.replace(/{{text}}/g, content)
      }

      const messages = [{ role: 'system', content: prompt }]

      // 如果有内容但提示词中没有{{text}}占位符，则添加用户消息
      if (content && !prompt.includes('{{text}}')) {
        messages.push({ role: 'user', content: `<translate_input>${content}</translate_input>` })
      }

      const modelId = assistant.model?.id || this.config.defaultModel

      if (onResponse) {
        const stream = await this.ollamaClient.chat({
          model: modelId,
          messages,
          stream: true,
          options: {
            temperature: this.config.temperature,
            num_predict: this.config.maxTokens
          }
        })

        let translatedText = ''
        for await (const part of stream) {
          if (part.message?.content) {
            const content = this.filterThinkingContent(part.message.content)
            if (content) {
              translatedText += content
              onResponse(content, false)
            }
          }
        }

        onResponse(translatedText || ' ', true)
        return translatedText || ' '
      } else {
        const response = await this.ollamaClient.chat({
          model: modelId,
          messages,
          stream: false,
          options: {
            temperature: this.config.temperature,
            num_predict: this.config.maxTokens
          }
        })

        return response.message?.content ? this.filterThinkingContent(response.message.content) || ' ' : ' '
      }
    } catch (error) {
      this.handleNetworkError(error)
      throw error
    }
  }

  /**
   * 获取支持的语言列表
   * @returns 支持的语言列表
   */
  public getSupportedLanguages(): Record<string, string> {
    return {
      'en-US': 'English',
      'zh-CN': '简体中文',
      'zh-TW': '繁體中文',
      'ja-JP': '日本語',
      'ko-KR': '한국어',
      'fr-FR': 'Français',
      'de-DE': 'Deutsch',
      'es-ES': 'Español',
      'it-IT': 'Italiano',
      'ru-RU': 'Русский'
    }
  }

  // 工具方法
  /**
   * 过滤思考内容
   * @param content 原始内容
   * @returns 过滤后的内容
   */
  private filterThinkingContent(content: string): string {
    if (!content) return ' '
    // 过滤thinking标签和translate_input标签
    const regex =
      /<thinking>[\s\S]*?<\/thinking>|<think>[\s\S]*?<\/think>|<translate_input>[\s\S]*?<\/translate_input>/gi
    return content.replace(regex, '').trim() || ' '
  }

  /**
   * 处理消息内容
   * @param content 消息内容
   * @returns 处理后的字符串内容
   */
  private processMessageContent(content: string | any): string {
    if (typeof content === 'string') {
      return content
    }
    return JSON.stringify(content)
  }

  /**
   * 处理网络错误
   * @param error 错误对象
   */
  private handleNetworkError(error: unknown): void {
    if (error instanceof Error) {
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        this.log(LogLevel.ERROR, 'Network error: Unable to connect to Ollama server')
        throw new Error('Unable to connect to Ollama server. Please check if Ollama is running and accessible.')
      } else if (error.message.includes('ECONNREFUSED') || error.message.includes('Connection refused')) {
        this.log(LogLevel.ERROR, 'Connection refused: Ollama server is not running or not accessible')
        throw new Error('Connection to Ollama server refused. Please check if Ollama is running and accessible.')
      }
    }
    // 重新抛出原始错误
    throw error
  }

  /**
   * 检查模型是否正在下载
   * @param modelId 模型ID
   * @returns 是否正在下载
   */
  private isModelDownloading(modelId: string): boolean {
    return this.modelDownloadProgress.has(modelId)
  }

  /**
   * 获取模型下载进度
   * @param modelId 模型ID
   * @returns 下载进度百分比
   */
  private getModelDownloadProgress(modelId: string): number {
    return this.modelDownloadProgress.get(modelId) || 0
  }

  /**
   * 记录日志
   * @param level 日志级别
   * @param message 日志消息
   */
  private log(level: LogLevel, message: string): void {
    const timestamp = new Date().toISOString()
    const prefix = `[${timestamp}] [Ollama] [${level.toUpperCase()}]`

    switch (level) {
      case LogLevel.ERROR:
        console.error(`${prefix} ${message}`)
        break
      case LogLevel.WARN:
        console.warn(`${prefix} ${message}`)
        break
      case LogLevel.INFO:
        console.info(`${prefix} ${message}`)
        break
      case LogLevel.DEBUG:
        console.debug(`${prefix} ${message}`)
        break
      default:
        console.log(`${prefix} ${message}`)
    }
  }
}
