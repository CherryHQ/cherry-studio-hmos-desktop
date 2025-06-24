import {
  getOpenAIWebSearchParams,
  isSupportedReasoningEffortOpenAIModel,
  isSupportedThinkingTokenQwenModel
} from '@renderer/config/models'
import { processPostsuffixQwen3Model, processReqMessages } from '@renderer/services/ModelMessageService'
import { Provider, WebSearchSource } from '@renderer/types'
import { ChunkType } from '@renderer/types/chunk'
import {
  OpenAISdkMessageParam,
  OpenAISdkParams,
  OpenAISdkRawChunk,
  OpenAISdkRawContentSource,
  OpenAISdkRawOutput
} from '@renderer/types/sdk'
import { addImageFileToContents } from '@renderer/utils/formats'
import { isEnabledToolUse } from '@renderer/utils/mcp-tools'
import { buildSystemPrompt } from '@renderer/utils/prompt'
import OpenAI from 'openai'
import { Stream } from 'openai/streaming'

import { RequestTransformer, ResponseChunkTransformer, ResponseChunkTransformerContext } from '../types'
import { OpenAIAPIClient } from './OpenAIApiClient'

export class OllamaApiClient extends OpenAIAPIClient {
  constructor(provider: Provider) {
    super(provider)
  }
  // 仅适用于openai
  override getBaseURL(): string {
    const host = this.provider.apiHost
    return host
  }
  override async listModels(): Promise<OpenAI.Models.Model[]> {
    const baseURL = this.getBaseURL()

    const response = await fetch(baseURL + '/api/tags', {
      method: 'get',
      headers: {
        'Content-Type': 'application/json'
      }
    })
    const data = await response.json()
    const localmodels = data.models
    const arr: any = []
    for (let i = 0; i < localmodels.length; i++) {
      arr.push({
        created: localmodels[i].modified_at,
        id: localmodels[i].name,
        object: 'model',
        owned_by: 'library'
      })
    }

    return arr
  }
  override async createCompletions(
    payload: OpenAISdkParams,
    options?: OpenAI.RequestOptions
  ): Promise<OpenAISdkRawOutput> {
    const baseURL = this.getBaseURL()
    return new Stream(async function* () {
      console.log('????', options, payload)
      console.log(payload.messages)
      const newMessage = payload.messages.map((message) => {
        if (Array.isArray(message.content)) {
          const concatenatedText = message.content.map((item) => item.text).join('  ')
          return {
            ...message,
            content: concatenatedText
          }
        }
        return message
      })

      const body = JSON.stringify({
        model: payload.model,
        messages: newMessage,
        stream: payload.stream,
        temperature: payload?.temperature
        // enable_thinking: false
      })
      const response = await fetch(baseURL + '/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: body,
        signal: options?.signal,
        timeout: options?.timeout
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No reader available')
      }

      const decoder = new TextDecoder()
      let buffer = ''
      console.log(options, options?.signal?.aborted, '?????')
      while (options?.signal?.aborted != true) {
        //这块进行优化
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep the last incomplete line in the buffer

        for (const line of lines) {
          if (line.trim()) {
            try {
              yield JSON.parse(line)
            } catch (e) {
              console.error('Failed to parse JSON:', line, e)
            }
          }
        }
      }

      if (buffer.trim()) {
        try {
          yield JSON.parse(buffer)
        } catch (e) {
          console.error('Failed to parse JSON:', buffer, e)
        }
      }
    }, new AbortController())
  }
  getRequestTransformer(): RequestTransformer<OpenAISdkParams, OpenAISdkMessageParam> {
    return {
      transform: async (
        coreRequest,
        assistant,
        model,
        isRecursiveCall,
        recursiveSdkMessages
      ): Promise<{
        payload: OpenAISdkParams
        messages: OpenAISdkMessageParam[]
        metadata: Record<string, any>
      }> => {
        console.log('OllamaApiClient.ts: 55', coreRequest, assistant, model, isRecursiveCall, recursiveSdkMessages)
        const { messages, mcpTools, maxTokens, streamOutput, enableWebSearch } = coreRequest
        // 1. 处理系统消息
        let systemMessage = { role: 'system', content: assistant.prompt || '' }

        if (isSupportedReasoningEffortOpenAIModel(model)) {
          systemMessage = {
            role: 'developer',
            content: `Formatting re-enabled${systemMessage ? '\n' + systemMessage.content : ''}`
          }
        }

        if (model.id.includes('o1-mini') || model.id.includes('o1-preview')) {
          systemMessage.role = 'assistant'
        }

        // 2. 设置工具（必须在this.usesystemPromptForTools前面）
        const { tools } = this.setupToolsConfig({
          mcpTools: mcpTools,
          model,
          enableToolUse: isEnabledToolUse(assistant)
        })

        if (this.useSystemPromptForTools) {
          systemMessage.content = await buildSystemPrompt(systemMessage.content || '', mcpTools, assistant)
        }

        // 3. 处理用户消息
        const userMessages: OpenAISdkMessageParam[] = []
        if (typeof messages === 'string') {
          userMessages.push({ role: 'user', content: messages })
        } else {
          const processedMessages = addImageFileToContents(messages)
          for (const message of processedMessages) {
            userMessages.push(await this.convertMessageToSdkParam(message, model))
          }
        }
        console.log('aaa')
        const lastUserMsg = userMessages.findLast((m) => m.role === 'user')
        if (lastUserMsg && isSupportedThinkingTokenQwenModel(model)) {
          const postsuffix = '/no_think'
          const qwenThinkModeEnabled = assistant.settings?.qwenThinkMode === true
          const currentContent = lastUserMsg.content

          lastUserMsg.content = processPostsuffixQwen3Model(currentContent, postsuffix, qwenThinkModeEnabled) as any
        }

        // 4. 最终请求消息
        let reqMessages: OpenAISdkMessageParam[]
        if (!systemMessage.content) {
          reqMessages = [...userMessages]
        } else {
          reqMessages = [systemMessage, ...userMessages].filter(Boolean) as OpenAISdkMessageParam[]
        }

        reqMessages = processReqMessages(model, reqMessages)

        // 5. 创建通用参数
        const commonParams = {
          model: model.id,
          messages:
            isRecursiveCall && recursiveSdkMessages && recursiveSdkMessages.length > 0
              ? recursiveSdkMessages
              : reqMessages,
          temperature: this.getTemperature(assistant, model),
          top_p: this.getTopP(assistant, model),
          max_tokens: maxTokens,
          tools: tools.length > 0 ? tools : undefined,
          service_tier: this.getServiceTier(model),
          ...this.getProviderSpecificParameters(assistant, model),
          ...this.getReasoningEffort(assistant, model),
          ...getOpenAIWebSearchParams(model, enableWebSearch),
          ...this.getCustomParameters(assistant)
        }
        // Create the appropriate parameters object based on whether streaming is enabled
        const sdkParams: OpenAISdkParams = streamOutput
          ? {
              ...commonParams,
              stream: true
            }
          : {
              ...commonParams,
              stream: false
            }

        const timeout = this.getTimeout(model)
        console.log(sdkParams, messages, timeout, '走到这了吗')
        return { payload: sdkParams, messages: reqMessages, metadata: { timeout } }
      }
    }
  }
  toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] = []

  getResponseChunkTransformer = (): ResponseChunkTransformer<OpenAISdkRawChunk> => {
    let hasBeenCollectedWebSearch = false
    console.log('OllamaApiClient.ts: 123', hasBeenCollectedWebSearch)
    const collectWebSearchData = (
      chunk: OpenAISdkRawChunk,
      contentSource: OpenAISdkRawContentSource,
      context: ResponseChunkTransformerContext
    ) => {
      console.log(chunk, contentSource, context, 'aaaaaaaaaaaaaaaaaaa')
      if (hasBeenCollectedWebSearch) {
        return
      }
      // OpenAI annotations
      // @ts-ignore - annotations may not be in standard type definitions
      const annotations = contentSource.annotations || chunk.annotations
      if (annotations && annotations.length > 0 && annotations[0].type === 'url_citation') {
        hasBeenCollectedWebSearch = true
        return {
          results: annotations,
          source: WebSearchSource.OPENAI
        }
      }

      // Grok citations
      // @ts-ignore - citations may not be in standard type definitions
      if (context.provider?.id === 'grok' && chunk.citations) {
        hasBeenCollectedWebSearch = true
        return {
          // @ts-ignore - citations may not be in standard type definitions
          results: chunk.citations,
          source: WebSearchSource.GROK
        }
      }

      // Perplexity citations
      // @ts-ignore - citations may not be in standard type definitions
      if (context.provider?.id === 'perplexity' && chunk.citations && chunk.citations.length > 0) {
        hasBeenCollectedWebSearch = true
        return {
          // @ts-ignore - citations may not be in standard type definitions
          results: chunk.citations,
          source: WebSearchSource.PERPLEXITY
        }
      }

      // OpenRouter citations
      // @ts-ignore - citations may not be in standard type definitions
      if (context.provider?.id === 'openrouter' && chunk.citations && chunk.citations.length > 0) {
        hasBeenCollectedWebSearch = true
        return {
          // @ts-ignore - citations may not be in standard type definitions
          results: chunk.citations,
          source: WebSearchSource.OPENROUTER
        }
      }

      // Zhipu web search
      // @ts-ignore - web_search may not be in standard type definitions
      if (context.provider?.id === 'zhipu' && chunk.web_search) {
        hasBeenCollectedWebSearch = true
        return {
          // @ts-ignore - web_search may not be in standard type definitions
          results: chunk.web_search,
          source: WebSearchSource.ZHIPU
        }
      }

      // Hunyuan web search
      // @ts-ignore - search_info may not be in standard type definitions
      if (context.provider?.id === 'hunyuan' && chunk.search_info?.search_results) {
        hasBeenCollectedWebSearch = true
        return {
          // @ts-ignore - search_info may not be in standard type definitions
          results: chunk.search_info.search_results,
          source: WebSearchSource.HUNYUAN
        }
      }

      // TODO: 放到AnthropicApiClient中
      // // Other providers...
      // // @ts-ignore - web_search may not be in standard type definitions
      // if (chunk.web_search) {
      //   const sourceMap: Record<string, string> = {
      //     openai: 'openai',
      //     anthropic: 'anthropic',
      //     qwenlm: 'qwen'
      //   }
      //   const source = sourceMap[context.provider?.id] || 'openai_response'
      //   return {
      //     results: chunk.web_search,
      //     source: source as const
      //   }
      // }

      return null
    }
    return (context: ResponseChunkTransformerContext) => ({
      async transform(ollamaChunk: OpenAISdkRawChunk, controller: TransformStreamDefaultController<GenericChunk>) {
        console.warn(
          '🚀 ~ OllamaApiClient.ts:125 ~ OllamaApiClient ~ transform ~ ollamaChunk:',
          ollamaChunk,
          controller
        )
        const contentSource: OpenAISdkRawContentSource | null = ollamaChunk.message ? ollamaChunk.message : null

        if (!contentSource) return
        const webSearchData = collectWebSearchData(ollamaChunk, contentSource, context)
        if (webSearchData) {
          controller.enqueue({
            type: ChunkType.LLM_WEB_SEARCH_COMPLETE,
            llm_web_search: webSearchData
          })
        }

        if ('message' in ollamaChunk && ollamaChunk.message) {
          if (ollamaChunk) if (!ollamaChunk.message) return

          if (ollamaChunk.done) {
            if (ollamaChunk.message) {
              // 非流式传输
              controller.enqueue({
                type: ChunkType.TEXT_DELTA,
                text: ollamaChunk.message.content || ''
              })
            }
            console.log('结束了吗结束了吗结束了吗结束了吗结束了吗结束了吗结束了吗结束了吗结束了吗结束了吗结束了吗')
            controller.enqueue({
              type: ChunkType.LLM_RESPONSE_COMPLETE,
              response: {
                usage: {
                  prompt_tokens: 120,
                  completion_tokens: 210,
                  total_tokens: 1120
                }
              }
            })
            return
          }

          if (ollamaChunk.message) {
            controller.enqueue({
              type: ChunkType.TEXT_DELTA,
              text: ollamaChunk.message.content || ''
            })
          }
        }
      }
    })
  }
}
