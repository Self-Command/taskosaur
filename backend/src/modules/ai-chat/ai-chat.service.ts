import { Injectable, BadRequestException } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import {
  ChatRequestDto,
  ChatResponseDto,
  ChatMessageDto,
  TestConnectionDto,
  TestConnectionResponseDto,
  GenerateDescriptionDto,
  GenerateDescriptionResponseDto,
  CreateConversationDto,
  RenameConversationDto,
  UpdateMessagesDto,
} from './dto/chat.dto';
import { SettingsService } from '../settings/settings.service';
import { McpToolsService } from '../mcp-tools/mcp-tools.service';
import { getMCPSystemPrompt } from '../mcp-tools/prompts';
import { PrismaService } from '../../prisma/prisma.service';
import { Conversation } from '@prisma/client';

const MAX_TOOL_ITERATIONS = 10;

@Injectable()
export class AiChatService {
  constructor(
    private settingsService: SettingsService,
    private prisma: PrismaService,
    private mcpToolsService: McpToolsService,
  ) {}

  private detectProvider(apiUrl: string): string {
    try {
      const parsedUrl = new URL(apiUrl);
      const hostname = parsedUrl.hostname;

      if (this.isLocalhost(hostname) || this.isPrivateNetwork(hostname)) {
        return 'ollama';
      }

      if (hostname === 'openrouter.ai' || hostname.endsWith('.openrouter.ai')) return 'openrouter';
      if (hostname === 'api.openai.com' || hostname.endsWith('.api.openai.com')) return 'openai';
      if (hostname === 'api.anthropic.com' || hostname.endsWith('.api.anthropic.com'))
        return 'anthropic';
      if (
        hostname === 'generativelanguage.googleapis.com' ||
        hostname.endsWith('.generativelanguage.googleapis.com')
      )
        return 'google';
    } catch (e) {
      console.log(e);
    }
    return 'custom';
  }

  /**
   * Streaming chat method compatible with Vercel AI SDK protocol
   */
  async *chatStreamAISDK(chatRequest: ChatRequestDto, userId: string): AsyncGenerator<string> {
    try {
      const isEnabled = await this.settingsService.get('ai_enabled', userId);
      if (isEnabled !== 'true') {
        yield `0:${JSON.stringify({ type: 'error', error: 'AI chat is currently disabled' })}\n`;
        return;
      }

      const [apiKey, rawApiUrl] = await Promise.all([
        this.settingsService.get('ai_api_key', userId),
        this.settingsService.get('ai_api_url', userId),
      ]);

      if (!rawApiUrl) {
        yield `0:${JSON.stringify({ type: 'error', error: 'AI API URL not configured' })}\n`;
        return;
      }

      const apiUrl = this.validateApiUrl(rawApiUrl);
      const provider = this.detectProvider(apiUrl);

      if (!apiKey && provider !== 'ollama') {
        yield `0:${JSON.stringify({ type: 'error', error: 'AI API key not configured' })}\n`;
        return;
      }

      // Find or create conversation
      let conversation: any = chatRequest.sessionId
        ? await this.prisma.conversation.findUnique({
            where: { sessionId: chatRequest.sessionId },
          })
        : null;
      if (!conversation && chatRequest.sessionId) {
        conversation = await this.prisma.conversation.create({
          data: { userId, sessionId: chatRequest.sessionId, title: 'New Chat' },
        });
      }

      // Build messages
      const messages: ChatMessageDto[] = [];
      messages.push({ role: 'system', content: getMCPSystemPrompt() });

      let userMessage = chatRequest.message;
      if (chatRequest.workspaceId || chatRequest.projectId) {
        const contextParts: string[] = [];
        if (chatRequest.workspaceId) contextParts.push(`workspaceId: ${chatRequest.workspaceId}`);
        if (chatRequest.projectId) contextParts.push(`projectId: ${chatRequest.projectId}`);
        if (chatRequest.currentOrganizationId)
          contextParts.push(`organizationId: ${chatRequest.currentOrganizationId}`);
        userMessage = `[Context: ${contextParts.join(', ')}]\n\n${userMessage}`;
      }

      messages.push({ role: 'user', content: userMessage });

      // Tool-calling loop with AI SDK protocol streaming
      let streamIndex = 0;
      let finalResponse = '';

      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
        const llmResponse = await this.callLlmWithTools(messages, userId, provider, apiUrl, apiKey);

        if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0) {
          const assistantMsg: any = {
            role: 'assistant',
            content: llmResponse.content || null,
            tool_calls: llmResponse.toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function',
              function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
            })),
          };
          messages.push(assistantMsg);

          // Stream assistant text if any
          if (llmResponse.content) {
            yield `${streamIndex++}:${JSON.stringify({ type: 'text', text: llmResponse.content })}\n`;
          }

          for (const toolCall of llmResponse.toolCalls) {
            const toolName = toolCall.name;
            const toolParams = toolCall.arguments;
            const toolCallId = toolCall.id;

            // Emit tool call start (AI SDK format)
            yield `${streamIndex++}:${JSON.stringify({
              type: 'tool-call',
              toolCallId: toolCallId,
              toolName: toolName,
              args: toolParams,
            })}\n`;

            const toolResult = await this.mcpToolsService.executeTool(toolName, toolParams, userId);

            // Emit tool result (AI SDK format)
            yield `${streamIndex++}:${JSON.stringify({
              type: 'tool-result',
              toolCallId: toolCallId,
              toolName: toolName,
              result: toolResult,
            })}\n`;

            messages.push({
              role: 'tool',
              content: JSON.stringify(toolResult),
              tool_call_id: toolCallId,
            } as any);
          }
        } else {
          finalResponse = llmResponse.content || 'Done.';
          if (llmResponse.content) {
            // Stream final text response
            yield `${streamIndex++}:${JSON.stringify({ type: 'text', text: llmResponse.content })}\n`;
            messages.push({ role: 'assistant', content: llmResponse.content });
          }
          break;
        }
      }

      if (!finalResponse) {
        finalResponse = 'Task completed.';
        yield `${streamIndex++}:${JSON.stringify({ type: 'text', text: finalResponse })}\n`;
      }

      // Save messages and set title (survives disconnect)
      if (conversation) {
        await this.prisma.chatMessage
          .create({
            data: { conversationId: conversation.id, role: 'user', content: userMessage },
          })
          .catch(() => {});
        await this.prisma.chatMessage
          .create({
            data: { conversationId: conversation.id, role: 'assistant', content: finalResponse },
          })
          .catch(() => {});
        if (conversation.title === 'New Chat') {
          const convId = conversation.id;
          const msg = userMessage;
          const uid = userId;
          setImmediate(() => {
            this.generateConversationTitle(convId, msg, uid).catch(() => {});
          });
        }
      }

      // Emit finish event
      yield `${streamIndex++}:${JSON.stringify({ type: 'finish', finishReason: 'stop' })}\n`;
    } catch (error: any) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      yield `0:${JSON.stringify({ type: 'error', error: errorMessage })}\n`;
    }
  }

  /**
   * Streaming chat method with real-time tool execution updates (async generator)
   */
  async *chatStreamPost(chatRequest: ChatRequestDto, userId: string): AsyncGenerator<any> {
    try {
      const isEnabled = await this.settingsService.get('ai_enabled', userId);
      if (isEnabled !== 'true') {
        yield { type: 'error', error: 'AI chat is currently disabled' };
        return;
      }

      const [apiKey, rawApiUrl] = await Promise.all([
        this.settingsService.get('ai_api_key', userId),
        this.settingsService.get('ai_api_url', userId),
      ]);

      if (!rawApiUrl) {
        yield { type: 'error', error: 'AI API URL not configured' };
        return;
      }

      const apiUrl = this.validateApiUrl(rawApiUrl);
      const provider = this.detectProvider(apiUrl);

      if (!apiKey && provider !== 'ollama') {
        yield { type: 'error', error: 'AI API key not configured' };
        return;
      }

      // Build messages
      const messages: ChatMessageDto[] = [];
      messages.push({ role: 'system', content: getMCPSystemPrompt() });

      let userMessage = chatRequest.message;
      if (chatRequest.workspaceId || chatRequest.projectId) {
        const contextParts: string[] = [];
        if (chatRequest.workspaceId) contextParts.push(`workspaceId: ${chatRequest.workspaceId}`);
        if (chatRequest.projectId) contextParts.push(`projectId: ${chatRequest.projectId}`);
        if (chatRequest.currentOrganizationId)
          contextParts.push(`organizationId: ${chatRequest.currentOrganizationId}`);
        userMessage = `[Context: ${contextParts.join(', ')}]\n\n${userMessage}`;
      }

      messages.push({ role: 'user', content: userMessage });

      // Find or create conversation
      let conversation = await this.prisma.conversation.findUnique({
        where: { sessionId: chatRequest.sessionId! },
      });
      if (!conversation) {
        conversation = await this.prisma.conversation.create({
          data: { userId, sessionId: chatRequest.sessionId!, title: 'New Chat' },
        });
      }

      // Tool-calling loop with streaming
      let finalResponse = '';
      const toolExecutions: Array<{ tool: string; params: any; result: any }> = [];

      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
        const llmResponse = await this.callLlmWithTools(messages, userId, provider, apiUrl, apiKey);

        if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0) {
          const assistantMsg: any = {
            role: 'assistant',
            content: llmResponse.content || null,
            tool_calls: llmResponse.toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function',
              function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
            })),
          };
          messages.push(assistantMsg);

          for (const toolCall of llmResponse.toolCalls) {
            const toolName = toolCall.name;
            const toolParams = toolCall.arguments;
            const toolCallId = toolCall.id;

            // Emit tool start event
            yield { type: 'tool_start', tool: toolName, params: toolParams };

            const toolResult = await this.mcpToolsService.executeTool(toolName, toolParams, userId);
            toolExecutions.push({ tool: toolName, params: toolParams, result: toolResult });

            // Emit tool result event
            yield { type: 'tool_result', tool: toolName, params: toolParams, result: toolResult };

            messages.push({
              role: 'tool',
              content: JSON.stringify(toolResult),
              tool_call_id: toolCallId,
            } as any);
          }
        } else {
          finalResponse = llmResponse.content || 'Done.';
          if (llmResponse.content) {
            messages.push({ role: 'assistant', content: llmResponse.content });
          }
          break;
        }
      }

      if (!finalResponse && toolExecutions.length > 0) {
        const toolSummary = toolExecutions
          .map((te) => te.result?.message || `${te.tool} executed`)
          .join('; ');
        finalResponse = toolSummary || 'Task completed.';
      }

      // Save conversation messages
      if (conversation) {
        await this.prisma.chatMessage.create({
          data: { conversationId: conversation.id, role: 'user', content: chatRequest.message },
        });
        await this.prisma.chatMessage.create({
          data: {
            conversationId: conversation.id,
            role: 'assistant',
            content: finalResponse,
            toolExecutions: toolExecutions.length > 0 ? toolExecutions : undefined,
          },
        });

        // Fire-and-forget AI title generation — completely detached from request lifecycle
        if (conversation.title === 'New Chat') {
          const convId = conversation.id;
          const msg = chatRequest.message;
          const uid = userId;
          setImmediate(() => {
            this.generateConversationTitle(convId, msg, uid).catch(() => {});
          });
        }
      }

      // Emit final response with conversation info
      yield {
        type: 'message',
        message: finalResponse,
        toolExecutions,
        conversationId: conversation.id,
        title: conversation?.title || 'New Chat',
      };
    } catch (error: any) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      yield { type: 'error', error: errorMessage };
    }
  }

  /**
   * Streaming chat method with real-time tool execution updates
   */
  chatStream(chatRequest: ChatRequestDto, userId: string): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();

    // Run the chat logic asynchronously and emit events
    (async () => {
      try {
        const isEnabled = await this.settingsService.get('ai_enabled', userId);
        if (isEnabled !== 'true') {
          subject.next({
            data: { type: 'error', error: 'AI chat is currently disabled' },
          } as MessageEvent);
          subject.complete();
          return;
        }

        const [apiKey, rawApiUrl] = await Promise.all([
          this.settingsService.get('ai_api_key', userId),
          this.settingsService.get('ai_api_url', userId),
        ]);

        if (!rawApiUrl) {
          subject.next({
            data: { type: 'error', error: 'AI API URL not configured' },
          } as MessageEvent);
          subject.complete();
          return;
        }

        const apiUrl = this.validateApiUrl(rawApiUrl);
        const provider = this.detectProvider(apiUrl);

        if (!apiKey && provider !== 'ollama') {
          subject.next({
            data: { type: 'error', error: 'AI API key not configured' },
          } as MessageEvent);
          subject.complete();
          return;
        }

        // Build messages
        const messages: ChatMessageDto[] = [];
        messages.push({ role: 'system', content: getMCPSystemPrompt() });

        let userMessage = chatRequest.message;
        if (chatRequest.workspaceId || chatRequest.projectId) {
          const contextParts: string[] = [];
          if (chatRequest.workspaceId) contextParts.push(`workspaceId: ${chatRequest.workspaceId}`);
          if (chatRequest.projectId) contextParts.push(`projectId: ${chatRequest.projectId}`);
          if (chatRequest.currentOrganizationId)
            contextParts.push(`organizationId: ${chatRequest.currentOrganizationId}`);
          userMessage = `[Context: ${contextParts.join(', ')}]\n\n${userMessage}`;
        }

        messages.push({ role: 'user', content: userMessage });

        // Tool-calling loop with streaming
        let finalResponse = '';
        const toolExecutions: Array<{ tool: string; params: any; result: any }> = [];

        for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
          const llmResponse = await this.callLlmWithTools(
            messages,
            userId,
            provider,
            apiUrl,
            apiKey,
          );

          if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0) {
            const assistantMsg: any = {
              role: 'assistant',
              content: llmResponse.content || null,
              tool_calls: llmResponse.toolCalls.map((tc) => ({
                id: tc.id,
                type: 'function',
                function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
              })),
            };
            messages.push(assistantMsg);

            for (const toolCall of llmResponse.toolCalls) {
              const toolName = toolCall.name;
              const toolParams = toolCall.arguments;
              const toolCallId = toolCall.id;

              // Emit tool start event
              subject.next({
                data: { type: 'tool_start', tool: toolName, params: toolParams },
              } as MessageEvent);

              const toolResult = await this.mcpToolsService.executeTool(
                toolName,
                toolParams,
                userId,
              );
              toolExecutions.push({ tool: toolName, params: toolParams, result: toolResult });

              // Emit tool result event
              subject.next({
                data: {
                  type: 'tool_result',
                  tool: toolName,
                  params: toolParams,
                  result: toolResult,
                },
              } as MessageEvent);

              messages.push({
                role: 'tool',
                content: JSON.stringify(toolResult),
                tool_call_id: toolCallId,
              } as any);
            }
          } else {
            finalResponse = llmResponse.content || 'Done.';
            if (llmResponse.content) {
              messages.push({ role: 'assistant', content: llmResponse.content });
            }
            break;
          }
        }

        if (!finalResponse && toolExecutions.length > 0) {
          const toolSummary = toolExecutions
            .map((te) => te.result?.message || `${te.tool} executed`)
            .join('; ');
          finalResponse = toolSummary || 'Task completed.';
        }

        // Emit final response
        subject.next({
          data: { type: 'message', message: finalResponse, toolExecutions },
        } as MessageEvent);

        subject.complete();
      } catch (error: any) {
        console.error(error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        subject.next({ data: { type: 'error', error: errorMessage } } as MessageEvent);
        subject.complete();
      }
    })();

    return subject.asObservable();
  }

  /**
   * Main chat method with MCP tool-calling loop
   */
  async chat(chatRequest: ChatRequestDto, userId: string): Promise<ChatResponseDto> {
    try {
      const isEnabled = await this.settingsService.get('ai_enabled', userId);
      if (isEnabled !== 'true') {
        throw new BadRequestException(
          'AI chat is currently disabled. Please enable it in settings.',
        );
      }

      const [apiKey, rawApiUrl] = await Promise.all([
        this.settingsService.get('ai_api_key', userId),
        this.settingsService.get('ai_api_url', userId),
      ]);

      if (!rawApiUrl) {
        throw new BadRequestException(
          'AI API URL not configured. Please set the API URL in settings.',
        );
      }

      const apiUrl = this.validateApiUrl(rawApiUrl);
      const provider = this.detectProvider(apiUrl);

      if (!apiKey && provider !== 'ollama') {
        throw new BadRequestException('AI API key not configured. Please set it in settings.');
      }

      // Find or create conversation
      let conversation: Conversation | null = null;
      let dbHistory: ChatMessageDto[] = [];

      if (chatRequest.sessionId) {
        conversation = await this.prisma.conversation.findUnique({
          where: { sessionId: chatRequest.sessionId },
        });

        if (!conversation) {
          conversation = await this.prisma.conversation.create({
            data: {
              userId,
              sessionId: chatRequest.sessionId,
              title: 'New Chat',
            },
          });
        } else {
          const historyMsgs = await this.prisma.chatMessage.findMany({
            where: { conversationId: conversation.id },
            orderBy: { createdAt: 'asc' },
            take: 40,
          });
          dbHistory = historyMsgs.map((m) => ({
            role: m.role as 'system' | 'user' | 'assistant',
            content: m.content,
          }));
        }
      }

      // Build messages with system prompt
      const messages: ChatMessageDto[] = [];
      messages.push({
        role: 'system',
        content: getMCPSystemPrompt(),
      });

      if (dbHistory.length > 0) {
        dbHistory.forEach((msg) => messages.push(msg));
      } else if (chatRequest.history && Array.isArray(chatRequest.history)) {
        chatRequest.history.forEach((msg) => messages.push(msg));
      }

      // Add context info if workspace/project provided
      let userMessage = chatRequest.message;
      if (chatRequest.workspaceId || chatRequest.projectId) {
        const contextParts: string[] = [];
        if (chatRequest.workspaceId) contextParts.push(`workspaceId: ${chatRequest.workspaceId}`);
        if (chatRequest.projectId) contextParts.push(`projectId: ${chatRequest.projectId}`);
        if (chatRequest.currentOrganizationId)
          contextParts.push(`organizationId: ${chatRequest.currentOrganizationId}`);
        userMessage = `[Context: ${contextParts.join(', ')}]\n\n${userMessage}`;
      }

      // Save user message + create placeholder for background processing
      let assistantMsgId = '';
      if (conversation) {
        await this.prisma.chatMessage.create({
          data: {
            conversationId: conversation.id,
            role: 'user',
            content: chatRequest.message,
          },
        });

        // Create placeholder assistant message synchronously so we can return its ID
        const assistantMsg = await this.prisma.chatMessage.create({
          data: {
            conversationId: conversation.id,
            role: 'assistant',
            content: '',
            status: 'pending',
          },
        });
        assistantMsgId = assistantMsg.id;

        if (conversation.title === 'New Chat') {
          // Fire-and-forget AI title generation — completely detached from request lifecycle
          const convId = conversation.id;
          const msg = chatRequest.message;
          const uid = userId;
          setImmediate(() => {
            this.generateConversationTitle(convId, msg, uid).catch(() => {});
          });
        }
      }

      messages.push({ role: 'user', content: userMessage });

      // Start background AI processing — don't await
      const convId = conversation?.id || '';
      this.processChatInBackground(
        chatRequest,
        userId,
        provider,
        apiUrl,
        apiKey,
        convId,
        assistantMsgId,
        messages,
      ).catch((err) => {
        console.error('Background AI chat failed:', err);
      });

      // Return immediately with message ID for polling
      return {
        message: '',
        success: true,
        status: 'processing',
        conversationId: convId,
        messageId: assistantMsgId,
      };
    } catch (error: any) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage?.includes('Failed to fetch') || errorMessage?.includes('NetworkError')) {
        return {
          message: 'Network error. Please check your internet connection.',
          success: false,
          error: 'Network error. Please check your internet connection.',
        };
      }
      return {
        message: errorMessage || 'Failed to process chat request',
        success: false,
        error: errorMessage || 'Failed to process chat request',
      };
    }
  }

  /**
   * Process AI chat in background — creates placeholder message, runs tool loop,
   * updates message as progress is made so frontend polling sees incremental results.
   */
  private async processChatInBackground(
    chatRequest: ChatRequestDto,
    userId: string,
    provider: string,
    apiUrl: string,
    apiKey: string | null,
    conversationId: string,
    messageId: string,
    messages: ChatMessageDto[],
  ): Promise<void> {
    try {
      // Mark placeholder as streaming
      await this.prisma.chatMessage.update({
        where: { id: messageId },
        data: { status: 'streaming' },
      });

      let finalResponse = '';
      const toolExecutions: Array<{ tool: string; params: any; result: any }> = [];

      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
        const llmResponse = await this.callLlmWithTools(messages, userId, provider, apiUrl, apiKey);

        if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0) {
          const assistantMsg2: any = {
            role: 'assistant',
            content: llmResponse.content || null,
            tool_calls: llmResponse.toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function',
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.arguments),
              },
            })),
          };
          messages.push(assistantMsg2);

          for (const toolCall of llmResponse.toolCalls) {
            const toolName = toolCall.name;
            const toolParams = toolCall.arguments;
            const toolCallId = toolCall.id;

            const toolResult = await this.mcpToolsService.executeTool(toolName, toolParams, userId);
            toolExecutions.push({ tool: toolName, params: toolParams, result: toolResult });

            messages.push({
              role: 'tool',
              content: JSON.stringify(toolResult),
              tool_call_id: toolCallId,
            } as any);

            // Update message incrementally so frontend polling sees progress
            await this.prisma.chatMessage.update({
              where: { id: messageId },
              data: {
                toolExecutions: [...toolExecutions] as any,
              },
            });
          }
        } else {
          finalResponse = llmResponse.content || 'Done.';
          if (llmResponse.content) {
            messages.push({ role: 'assistant', content: llmResponse.content });
          }
          break;
        }
      }

      if (!finalResponse && toolExecutions.length > 0) {
        const successMsg = toolExecutions
          .map((te) => te.result?.message)
          .filter(Boolean)
          .join('\n');
        finalResponse = successMsg || '操作已完成，点击上方卡片查看详情。';
      }

      // Save complete response
      await this.prisma.chatMessage.update({
        where: { id: messageId },
        data: {
          content: finalResponse,
          toolExecutions: toolExecutions.length > 0 ? (toolExecutions as any) : undefined,
          status: 'completed',
        },
      });
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });
    } catch (error: any) {
      console.error('Background AI chat error:', error);
      if (messageId) {
        await this.prisma.chatMessage
          .update({
            where: { id: messageId },
            data: {
              status: 'error',
              content: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          })
          .catch(() => {});
      }
    }
  }

  /**
   * Call LLM with tool definitions and parse tool call responses
   */
  private async callLlmWithTools(
    messages: ChatMessageDto[],
    userId: string,
    provider: string,
    apiUrl: string,
    apiKey: string | null,
  ): Promise<{
    content: string | null;
    toolCalls: Array<{ id: string; name: string; arguments: any }> | null;
  }> {
    const model = await this.settingsService.get('ai_model', userId);
    if (!model) throw new BadRequestException('AI model not configured.');

    const isGpt5Model = typeof model === 'string' && model.startsWith('gpt-5');
    const toolDefs = this.mcpToolsService.getToolDefinitions();

    let requestUrl = apiUrl;
    const requestHeaders: any = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };
    let requestBody: any;

    switch (provider) {
      case 'openrouter':
      case 'openai':
      case 'custom': {
        requestUrl = `${apiUrl}/chat/completions`;
        requestBody = {
          model,
          messages: this.formatMessagesForOpenAI(messages),
          tools: this.mcpToolsService.getOpenAITools(),
          tool_choice: 'auto',
          temperature: 0.1,
          stream: false,
        };
        if (provider === 'openai') {
          delete requestBody.max_tokens;
          requestBody.max_completion_tokens = 2000;
          if (isGpt5Model) delete requestBody.temperature;
        } else if (provider === 'openrouter') {
          requestHeaders['HTTP-Referer'] = process.env.APP_URL || 'http://localhost:3000';
          requestHeaders['X-Title'] = 'Taskosaur AI Assistant';
        }
        break;
      }

      case 'anthropic': {
        requestUrl = `${apiUrl}/messages`;
        requestHeaders['x-api-key'] = apiKey;
        requestHeaders['anthropic-version'] = '2023-06-01';
        delete requestHeaders['Authorization'];

        const systemMsg = messages.find((m) => m.role === 'system');
        const nonSystemMsgs = messages.filter(
          (m) => m.role !== 'system' && (m as any).role !== 'tool',
        );

        requestBody = {
          model,
          messages: this.formatMessagesForAnthropic(nonSystemMsgs),
          system: systemMsg?.content || '',
          tools: this.mcpToolsService.getAnthropicTools(),
          max_tokens: 2000,
          temperature: 0.1,
        };
        break;
      }

      case 'ollama': {
        if (apiUrl.includes('/v1')) {
          requestUrl = apiUrl.endsWith('/chat/completions') ? apiUrl : `${apiUrl}/chat/completions`;
        } else if (apiUrl.includes('/api')) {
          requestUrl = apiUrl.endsWith('/chat') ? apiUrl : `${apiUrl}/chat`;
        } else {
          requestUrl = `${apiUrl}/v1/chat/completions`;
        }
        delete requestHeaders['Authorization'];
        requestBody = {
          model,
          messages: this.formatMessagesForOpenAI(messages),
          tools: this.mcpToolsService.getOpenAITools(),
          tool_choice: 'auto',
          temperature: 0.1,
          stream: false,
        };
        break;
      }

      case 'google': {
        this.validateModelName(model);
        requestUrl = `${apiUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey || '')}`;
        delete requestHeaders['Authorization'];
        const cleanMessagesForGoogle = messages.filter((m) => (m as any).role !== 'tool');
        requestBody = {
          contents: this.formatMessagesForGoogle(cleanMessagesForGoogle),
          tools: [{ functionDeclarations: this.mcpToolsService.getGoogleFunctionDeclarations() }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2000,
          },
        };
        break;
      }

      default: {
        requestUrl = `${apiUrl}/chat/completions`;
        requestBody = {
          model,
          messages: this.formatMessagesForOpenAI(messages),
          tools: this.mcpToolsService.getOpenAITools(),
          tool_choice: 'auto',
          temperature: 0.1,
          stream: false,
        };
      }
    }

    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 401) {
        throw new BadRequestException('Invalid API key.');
      } else if (response.status === 429) {
        throw new BadRequestException('Rate limit exceeded.');
      }
      throw new BadRequestException(
        errorData?.error?.message || `LLM API returned status ${response.status}`,
      );
    }

    const responseData = await response.json();

    // Parse response based on provider
    return this.parseLLMResponse(responseData, provider);
  }

  /**
   * Parse LLM response to extract content and tool calls
   */
  private parseLLMResponse(
    data: any,
    provider: string,
  ): {
    content: string | null;
    toolCalls: Array<{ id: string; name: string; arguments: any }> | null;
  } {
    switch (provider) {
      case 'anthropic': {
        const contentBlocks = data?.content || [];
        let textContent = '';
        const toolCalls: Array<{ id: string; name: string; arguments: any }> = [];

        for (const block of contentBlocks) {
          if (block.type === 'text') {
            textContent += block.text;
          } else if (block.type === 'tool_use') {
            toolCalls.push({
              id: block.id,
              name: block.name,
              arguments: block.input,
            });
          }
        }

        return {
          content: textContent || null,
          toolCalls: toolCalls.length > 0 ? toolCalls : null,
        };
      }

      case 'google': {
        const candidate = data?.candidates?.[0];
        const contentParts = candidate?.content?.parts || [];
        let textContent = '';
        const toolCalls: Array<{ id: string; name: string; arguments: any }> = [];

        for (const part of contentParts) {
          if (part.text) {
            textContent += part.text;
          } else if (part.functionCall) {
            toolCalls.push({
              id: `google_${Date.now()}_${Math.random().toString(36).substring(2)}`,
              name: part.functionCall.name,
              arguments: part.functionCall.args,
            });
          }
        }

        return {
          content: textContent || null,
          toolCalls: toolCalls.length > 0 ? toolCalls : null,
        };
      }

      default: {
        // OpenAI-compatible format (OpenAI, OpenRouter, Ollama, Custom)
        const choice = data?.choices?.[0];
        const message = choice?.message;
        let content = message?.content || null;
        const toolCallsRaw = message?.tool_calls;

        // Ollama native format fallback
        if (!content && !toolCallsRaw) {
          content = data?.message?.content || data?.response || null;
        }

        if (toolCallsRaw && toolCallsRaw.length > 0) {
          const toolCalls = toolCallsRaw.map((tc: any) => ({
            id: tc.id || `call_${Date.now()}_${Math.random().toString(36).substring(2)}`,
            name: tc.function?.name || tc.name,
            arguments:
              typeof tc.function?.arguments === 'string'
                ? JSON.parse(tc.function.arguments)
                : tc.function?.arguments || tc.arguments || {},
          }));
          return { content, toolCalls };
        }

        return { content, toolCalls: null };
      }
    }
  }

  /**
   * Format messages for OpenAI-compatible API (includes tool role messages)
   */
  private formatMessagesForOpenAI(messages: ChatMessageDto[]): any[] {
    return messages.map((m) => {
      const msg: any = { role: m.role, content: m.content };
      if ((m as any).tool_call_id) {
        msg.tool_call_id = (m as any).tool_call_id;
      }
      if ((m as any).tool_calls) {
        msg.tool_calls = (m as any).tool_calls;
      }
      return msg;
    });
  }

  /**
   * Format messages for Anthropic API
   */
  private formatMessagesForAnthropic(messages: ChatMessageDto[]): any[] {
    return messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role,
        content: m.content || '',
      }));
  }

  /**
   * Format messages for Google Gemini API
   */
  private formatMessagesForGoogle(messages: ChatMessageDto[]): any[] {
    return messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content || '' }],
      }));
  }

  /**
   * Simple LLM call without tools (for title generation etc.)
   * If overrides are provided, they take precedence over saved settings.
   */
  private async callLlmSimple(
    messages: ChatMessageDto[],
    userId: string,
    maxTokens = 100,
    overrides?: { apiKey?: string; model?: string; apiUrl?: string },
  ): Promise<string> {
    // Skip DB lookup when all overrides provided (e.g. test-connection)
    const hasAllOverrides = !!(
      overrides?.apiKey !== undefined &&
      overrides?.model &&
      overrides?.apiUrl
    );

    let apiKey: string | undefined;
    let model: string | undefined;
    let rawApiUrl: string | undefined;

    if (hasAllOverrides) {
      apiKey = overrides.apiKey;
      model = overrides.model;
      rawApiUrl = overrides.apiUrl;
    } else {
      const [savedApiKey, savedModel, savedApiUrl] = await Promise.all([
        this.settingsService.get('ai_api_key', userId),
        this.settingsService.get('ai_model', userId),
        this.settingsService.get('ai_api_url', userId),
      ]);
      apiKey = (overrides?.apiKey ?? savedApiKey) as string | undefined;
      model = (overrides?.model ?? savedModel) as string | undefined;
      rawApiUrl = (overrides?.apiUrl ?? savedApiUrl) as string | undefined;
    }

    if (!model || !rawApiUrl) throw new Error('AI not configured');

    const apiUrl = this.validateApiUrl(rawApiUrl);
    const provider = this.detectProvider(apiUrl);

    if (!apiKey && provider !== 'ollama') throw new Error('API key required');

    const isGpt5Model = typeof model === 'string' && model.startsWith('gpt-5');

    let requestUrl = apiUrl;
    const requestHeaders: any = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };
    let requestBody: any = {
      model,
      messages,
      temperature: 0.1,
      max_tokens: maxTokens,
      stream: false,
    };

    switch (provider) {
      case 'openrouter':
        requestUrl = `${apiUrl}/chat/completions`;
        requestHeaders['HTTP-Referer'] = process.env.APP_URL || 'http://localhost:3000';
        requestHeaders['X-Title'] = 'Taskosaur AI Assistant';
        break;
      case 'openai':
        requestUrl = `${apiUrl}/chat/completions`;
        delete requestBody.max_tokens;
        requestBody.max_completion_tokens = maxTokens;
        if (isGpt5Model) delete requestBody.temperature;
        break;
      case 'ollama':
        if (apiUrl.includes('/v1')) {
          requestUrl = apiUrl.endsWith('/chat/completions') ? apiUrl : `${apiUrl}/chat/completions`;
        } else if (apiUrl.includes('/api')) {
          requestUrl = apiUrl.endsWith('/chat') ? apiUrl : `${apiUrl}/chat`;
        } else {
          requestUrl = `${apiUrl}/v1/chat/completions`;
        }
        delete requestHeaders['Authorization'];
        break;
      case 'anthropic':
        requestUrl = `${apiUrl}/messages`;
        requestHeaders['x-api-key'] = apiKey;
        requestHeaders['anthropic-version'] = '2023-06-01';
        delete requestHeaders['Authorization'];
        requestBody = {
          model,
          messages: messages.filter((m) => m.role !== 'system'),
          system: messages.find((m) => m.role === 'system')?.content,
          max_tokens: maxTokens,
          temperature: 0.1,
        };
        break;
      case 'google':
        this.validateModelName(model);
        requestUrl = `${apiUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey || '')}`;
        delete requestHeaders['Authorization'];
        requestBody = {
          contents: messages.map((m) => ({
            role: m.role === 'assistant' ? 'model' : m.role === 'system' ? 'model' : m.role,
            parts: [{ text: m.content }],
          })),
          generationConfig: { temperature: 0.1, maxOutputTokens: maxTokens },
        };
        break;
      default:
        requestUrl = `${apiUrl}/chat/completions`;
        break;
    }

    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) throw new Error(`LLM API error: ${response.status}`);

    const responseData = await response.json();
    let aiMessage = '';

    if (provider === 'google') {
      aiMessage = responseData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else if (provider === 'anthropic') {
      aiMessage = responseData?.content?.[0]?.text || '';
    } else {
      aiMessage = responseData?.choices?.[0]?.message?.content || '';
      if (!aiMessage) aiMessage = responseData?.message?.content || '';
      if (!aiMessage) aiMessage = responseData?.response || '';
    }

    return aiMessage.trim();
  }

  // ========== KEEP EXISTING METHODS ==========

  async generateDescription(
    dto: GenerateDescriptionDto,
    userId: string,
  ): Promise<GenerateDescriptionResponseDto> {
    try {
      const isEnabled = await this.settingsService.get('ai_enabled', userId);
      if (isEnabled !== 'true') {
        return { description: '', success: false, error: 'AI is not enabled.' };
      }

      const systemPrompt = `You are a helpful assistant that generates concise task descriptions for a project management tool.
Given a task title and type, generate a clear, actionable description in Markdown format.
Keep it brief (2-4 sentences). Include a summary of what needs to be done and key acceptance criteria.
Do NOT include the title itself in the description.
Do NOT wrap the response in code blocks.
Respond ONLY with the description text, nothing else.`;

      const userMessage = `Generate a description for this ${(dto.taskType || 'TASK').toLowerCase()}:\nTitle: "${dto.title}"`;

      const description = await this.callLlmSimple(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        userId,
        300,
      );

      return { description, success: true };
    } catch (error: any) {
      console.error('Generate description failed:', error);
      return {
        description: '',
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate description',
      };
    }
  }

  async clearContext(sessionId: string): Promise<{ success: boolean }> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { sessionId },
    });
    if (conversation) {
      await this.prisma.chatMessage.deleteMany({
        where: { conversationId: conversation.id },
      });
    }
    return { success: true };
  }

  async testConnection(testConnectionDto: TestConnectionDto): Promise<TestConnectionResponseDto> {
    const { apiKey, model, apiUrl } = testConnectionDto;

    try {
      const validatedUrl = this.validateApiUrl(apiUrl);

      // Build a simple OpenAI-compatible /chat/completions request.
      // This is the de facto standard — works with OpenAI, DeepSeek, OpenRouter,
      // Ollama (when using /v1 prefix), Groq, Together, vLLM, and most proxies.
      let requestUrl = validatedUrl;
      if (!requestUrl.endsWith('/chat/completions')) {
        requestUrl = requestUrl.replace(/\/$/, '') + '/chat/completions';
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const body = JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 10,
        temperature: 0,
      });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(requestUrl, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        let errorDetail = `HTTP ${response.status}`;
        try {
          const errData = await response.json();
          if (errData?.error?.message) errorDetail += `: ${errData.error.message}`;
          else if (errData?.message) errorDetail += `: ${errData.message}`;
        } catch {}
        return { success: false, error: errorDetail };
      }

      const data = await response.json();

      // Try all common response formats
      const reply =
        data?.choices?.[0]?.message?.content ||
        data?.message?.content ||
        data?.response ||
        data?.content ||
        '';

      if (reply) {
        return {
          success: true,
          message: 'Connection successful! Your AI configuration is working correctly.',
        };
      }

      // Even if we got a 200 with no parseable content, the connection works
      return {
        success: true,
        message: 'Connection successful! The API responded but with an unexpected format.',
      };
    } catch (error: unknown) {
      console.error('Test connection failed:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('AbortError') || errorMessage.includes('aborted')) {
        return { success: false, error: 'Request timed out (30s). Check the API URL or network.' };
      }
      const causeCode = error instanceof Error ? (error as any).cause?.code : undefined;
      if (causeCode === 'ECONNREFUSED' || errorMessage.includes('ECONNREFUSED')) {
        return { success: false, error: 'Connection refused. The AI service is not running.' };
      }
      if (causeCode === 'ENOTFOUND' || errorMessage.includes('ENOTFOUND')) {
        return { success: false, error: 'Host not found. Please check the API URL.' };
      }
      if (errorMessage.includes('fetch failed') || errorMessage.includes('NetworkError')) {
        return { success: false, error: 'Network error. Check your connection or the API URL.' };
      }

      return { success: false, error: errorMessage };
    }
  }

  // ========== CONVERSATION MANAGEMENT ==========

  async getConversation(userId: string, id: string) {
    return this.prisma.conversation.findFirst({
      where: { id, userId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  async getConversations(userId: string) {
    return this.prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: {
        messages: { orderBy: { createdAt: 'asc' }, take: 40 },
      },
    });
  }

  async createConversation(userId: string, dto: CreateConversationDto) {
    const sessionId =
      dto.sessionId || `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    return this.prisma.conversation.create({
      data: { userId, title: dto.title || 'New Chat', sessionId },
      include: { messages: true },
    });
  }

  /**
   * Generate a conversation title in the background.
   * Uses a separate Promise chain so it survives client disconnection.
   */
  private async generateConversationTitle(
    conversationId: string,
    userMessage: string,
    userId: string,
  ): Promise<void> {
    try {
      const titlePrompt = `Generate a very short title (max 4 words) for: "${userMessage.substring(0, 100)}"`;
      const aiTitle = await this.callLlmSimple([{ role: 'user', content: titlePrompt }], userId);
      let cleanTitle = aiTitle.replace(/['""`.\n]/g, '').trim();
      if (cleanTitle.length > 40) cleanTitle = cleanTitle.substring(0, 40) + '...';
      if (cleanTitle.length >= 2) {
        await this.prisma.conversation.update({
          where: { id: conversationId },
          data: { title: cleanTitle },
        });
      }
    } catch {
      const fallback = userMessage.substring(0, 30) + (userMessage.length > 30 ? '...' : '');
      try {
        await this.prisma.conversation.update({
          where: { id: conversationId },
          data: { title: fallback || 'New Chat' },
        });
      } catch {}
    }
  }

  async renameConversation(userId: string, id: string, dto: RenameConversationDto) {
    return this.prisma.conversation.update({
      where: { id, userId },
      data: { title: dto.title },
      include: { messages: true },
    });
  }

  async deleteConversation(userId: string, id: string) {
    await this.prisma.conversation.delete({ where: { id, userId } });
    return { success: true };
  }

  async updateMessages(userId: string, id: string, dto: UpdateMessagesDto) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, userId },
    });
    if (!conversation) throw new BadRequestException('Conversation not found');

    await this.prisma.$transaction([
      this.prisma.chatMessage.deleteMany({ where: { conversationId: id } }),
      this.prisma.chatMessage.createMany({
        data: dto.messages.map((msg) => ({
          conversationId: id,
          role: msg.role,
          content: msg.content,
        })),
      }),
      this.prisma.conversation.update({ where: { id }, data: { updatedAt: new Date() } }),
    ]);

    return { success: true };
  }

  // ========== VALIDATION HELPERS ==========

  private readonly allowedHosts: string[] = [
    'openrouter.ai',
    'api.openrouter.ai',
    'api.openai.com',
    'api.anthropic.com',
    'generativelanguage.googleapis.com',
    'aiplatform.googleapis.com',
  ];

  private isLocalhost(hostname: string): boolean {
    return ['localhost', '127.0.0.1', '::1'].includes(hostname.toLowerCase());
  }

  private isPrivateNetwork(hostname: string): boolean {
    const privateIPv4Pattern =
      /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2[0-9]|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})$/;
    return privateIPv4Pattern.test(hostname);
  }

  validateApiUrl(apiUrl: string): string {
    let url: URL;
    try {
      url = new URL(apiUrl);
    } catch {
      throw new BadRequestException('Invalid URL format');
    }

    const allowHttp = this.isLocalhost(url.hostname) || this.isPrivateNetwork(url.hostname);
    if (url.protocol !== 'https:' && !allowHttp) {
      throw new BadRequestException(
        'Only HTTPS URLs allowed (HTTP is permitted for localhost and private network addresses)',
      );
    }

    return url.toString().replace(/\/$/, '');
  }

  validateModelName(
    model: unknown,
    options: {
      allowedPattern?: RegExp;
      maxLength?: number;
      allowPathTraversal?: boolean;
      customErrorMessage?: string;
    } = {},
  ): void {
    const {
      allowedPattern = /^[a-zA-Z0-9.\-]+$/,
      maxLength = 100,
      allowPathTraversal = false,
      customErrorMessage = 'Model name contains invalid characters',
    } = options;

    if (!model || typeof model !== 'string') {
      throw new BadRequestException('Model name is required and must be a string');
    }

    const trimmed = model.trim();
    if (trimmed.length === 0) throw new BadRequestException('Model name cannot be empty');
    if (trimmed.length > maxLength)
      throw new BadRequestException(`Model name is too long (max ${maxLength} characters)`);
    if (!allowPathTraversal && trimmed.includes('..'))
      throw new BadRequestException('Model name cannot contain path traversal sequences');
    if (trimmed.startsWith('/') || /^[a-zA-Z]:\\/.test(trimmed))
      throw new BadRequestException('Model name cannot be an absolute path');
    if (!allowedPattern.test(trimmed)) throw new BadRequestException(customErrorMessage);
  }
}
