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
          vision: model.name.toLowerCase().includes('llama'), // LLaVA模型支持视觉功能
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
    const { messages, onResponse, assistant } = params

    try {
      const modelId = assistant.model?.id || this.config.defaultModel
      const ollamaMessages = messages.map((msg) => ({
        role: msg.role === 'system' ? 'system' : msg.role === 'assistant' ? 'assistant' : 'user',
        content: this.processMessageContent(msg.content)
      }))

      if (onResponse) {
        const stream = await this.ollamaClient.chat({
          model: modelId,
          messages: ollamaMessages,
          stream: true,
          options: {
            temperature: this.config.temperature,
            num_predict: this.config.maxTokens
          }
        })

        let fullResponse = ''
        for await (const part of stream) {
          if (part.message?.content) {
            const content = this.filterThinkingContent(part.message.content)
            if (content) {
              fullResponse += content
              onResponse(content, false)
            }
          }
        }

        onResponse(fullResponse || ' ', true)
      } else {
        const response = await this.ollamaClient.chat({
          model: modelId,
          messages: ollamaMessages,
          stream: false,
          options: {
            temperature: this.config.temperature,
            num_predict: this.config.maxTokens
          }
        })

        if (response.message?.content) {
          const content = this.filterThinkingContent(response.message.content)
          if (onResponse) {
            onResponse(content || ' ', true)
          }
        }
      }
    } catch (error) {
      this.handleNetworkError(error)
      if (onResponse) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        onResponse(`Error: ${errorMessage}`, true)
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
  private filterThinkingContent(content: string): string {
    if (!content) return ' '
    // 过滤thinking标签和translate_input标签
    const regex = /<thinking>[\s\S]*?<\/thinking>|<think>[\s\S]*?<\/think>|<translate_input>|<\/translate_input>/gi
    const result = content.replace(regex, '').trim()
    return result || ' '
  }

  /**
   * 检查模型是否正在下载
   */
  private isModelDownloading(modelId: string): boolean {
    return this.modelDownloadProgress.has(modelId)
  }

  /**
   * 获取模型下载进度
   */
  private getModelDownloadProgress(modelId: string): number {
    return this.modelDownloadProgress.get(modelId) || 0
  }

  private handleNetworkError(error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    this.log(LogLevel.ERROR, `Network error: ${errorMessage}`)
  }

  private log(level: LogLevel, message: string, ...args: any[]): void {
    const prefix = `[Ollama]`
    const timestamp = new Date().toISOString()
    console[level](`${timestamp} ${prefix} [${level.toUpperCase()}]`, message, ...args)
  }

  private processMessageContent(
    content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>
  ): string {
    if (!content) return ''
    if (typeof content === 'string') return content.trim()
    if (Array.isArray(content)) {
      return content
        .map((item) => {
          if (item.type === 'text' && item.text) return item.text.trim()
          if (item.type === 'image_url') return '[图片内容]'
          return ''
        })
        .filter(Boolean)
        .join('\n')
    }
  }

  public suggestions(_messages: Message[], _assistant: Assistant): Promise<Suggestion[]> {
    throw new Error('Method not implemented.')
  }

  public generateText(): Promise<string> {
    throw new Error('Method not implemented.')
  }

  public generateImage(_params: GenerateImageParams): Promise<string[]> {
    throw new Error('Method not implemented.')
  }

  public generateImageByChat(): Promise<void> {
    throw new Error('Method not implemented.')
  }

  public getEmbeddingDimensions(_model: Model): Promise<number> {
    throw new Error('Method not implemented.')
  }

  public convertMcpTools<T>(_mcpTools: MCPTool[]): T[] {
    throw new Error('Method not implemented.')
  }

  public mcpToolCallResponseToMessage(_mcpToolResponse: MCPToolResponse, _resp: MCPCallToolResponse, _model: Model) {
    throw new Error('Method not implemented.')
  }
}
