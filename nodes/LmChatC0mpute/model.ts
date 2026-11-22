import type { IHttpRequestMethods, RequestUrl } from 'n8n-workflow';
import { requestUrl } from 'n8n-workflow';
import {
	BaseChatModel,
	parseSSEStream,
	type ChatModelConfig,
	type FinishReason,
	type GenerateResult,
	type Message,
	type StreamChunk,
	type TokenUsage,
} from '@n8n/ai-node-sdk';
import { buildChatBody, flattenContent, toC0mputeMessages } from '../shared/messages';

export interface C0mputeChatModelConfig extends ChatModelConfig {
	baseUrl: string;
}

export interface C0mputeRequests {
	httpRequest: (method: IHttpRequestMethods, url: RequestUrl, body?: object) => Promise<{ body: unknown }>;
	openStream: (
		method: IHttpRequestMethods,
		url: RequestUrl,
		body?: object,
	) => Promise<{ body: AsyncIterableIterator<Buffer | Uint8Array> }>;
}

interface ChatCompletionResponse {
	id?: string;
	model?: string;
	choices?: Array<{
		message?: { content?: unknown };
		delta?: { content?: unknown };
		finish_reason?: string | null;
	}>;
	usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
	error?: unknown;
}

export function mapFinishReason(reason: string | null | undefined): FinishReason {
	switch (reason) {
		case 'stop':
		case null:
		case undefined:
			return 'stop';
		case 'length':
			return 'length';
		case 'content_filter':
			return 'content-filter';
		case 'tool_calls':
		case 'function_call':
			return 'tool-calls';
		default:
			return 'other';
	}
}

function mapUsage(usage: ChatCompletionResponse['usage']): TokenUsage | undefined {
	if (!usage) return undefined;
	const promptTokens = usage.prompt_tokens ?? 0;
	const completionTokens = usage.completion_tokens ?? 0;
	return {
		promptTokens,
		completionTokens,
		totalTokens: usage.total_tokens ?? promptTokens + completionTokens,
	};
}

function errorText(error: unknown): string {
	if (typeof error === 'string') return error;
	if (error && typeof error === 'object' && 'message' in error) {
		return String((error as { message: unknown }).message);
	}
	return JSON.stringify(error);
}

/**
 * Chat model for the c0mpute OpenAI-compatible API.
 *
 * The API does not support tool calling, so tools bound by an agent are
 * accepted (to stay compatible with n8n agents) but never sent upstream.
 */
export class C0mputeChatModel extends BaseChatModel<C0mputeChatModelConfig> {
	private readonly baseUrl: string;

	constructor(
		modelId: string,
		private readonly requests: C0mputeRequests,
		config: C0mputeChatModelConfig,
	) {
		super('c0mpute', modelId || 'auto', config);
		this.baseUrl = config.baseUrl;
	}

	buildRequestBody(messages: Message[], stream: boolean, config?: C0mputeChatModelConfig) {
		const merged = this.mergeConfig(config);
		const providerMessages = toC0mputeMessages(messages);
		if (providerMessages.length === 0) {
			throw new Error('c0mpute: no text content to send (the API accepts text messages only)');
		}
		return buildChatBody({
			model: this.modelId,
			messages: providerMessages,
			stream,
			temperature: merged.temperature,
			maxTokens: merged.maxTokens,
		});
	}

	async generate(messages: Message[], config?: C0mputeChatModelConfig): Promise<GenerateResult> {
		const body = this.buildRequestBody(messages, false, config);
		const response = await this.requests.httpRequest(
			'POST',
			requestUrl`${this.baseUrl}/chat/completions`,
			body,
		);
		const data = response.body as ChatCompletionResponse;
		if (data?.error) throw new Error(`c0mpute: ${errorText(data.error)}`);
		const choice = data?.choices?.[0];
		const text = flattenContent(choice?.message?.content);
		return {
			id: data?.id,
			finishReason: mapFinishReason(choice?.finish_reason),
			usage: mapUsage(data?.usage),
			message: { role: 'assistant', content: [{ type: 'text', text }] },
			providerMetadata: data?.model ? { model: data.model } : undefined,
		};
	}

	async *stream(messages: Message[], config?: C0mputeChatModelConfig): AsyncIterable<StreamChunk> {
		const body = this.buildRequestBody(messages, true, config);
		const response = await this.requests.openStream(
			'POST',
			requestUrl`${this.baseUrl}/chat/completions`,
			body,
		);
		let finishReason: FinishReason = 'stop';
		let usage: TokenUsage | undefined;
		for await (const event of parseSSEStream(response.body)) {
			// Comment lines such as ": status {...}" carry queue progress; skip them.
			if (event.data === undefined || event.data === '') continue;
			if (event.data.trim() === '[DONE]') break;
			let chunk: ChatCompletionResponse;
			try {
				chunk = JSON.parse(event.data) as ChatCompletionResponse;
			} catch {
				continue;
			}
			if (chunk.error) throw new Error(`c0mpute: ${errorText(chunk.error)}`);
			const choice = chunk.choices?.[0];
			const delta = flattenContent(choice?.delta?.content ?? choice?.message?.content);
			if (delta) yield { type: 'text-delta', id: chunk.id, delta };
			if (choice?.finish_reason) finishReason = mapFinishReason(choice.finish_reason);
			if (chunk.usage) usage = mapUsage(chunk.usage);
		}
		yield { type: 'finish', finishReason, usage };
	}
}
