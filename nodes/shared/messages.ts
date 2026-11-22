import type { Message, MessageContent } from '@n8n/ai-node-sdk';

/** An OpenAI tool call, as the c0mpute API takes and returns it. */
export interface C0mputeToolCall {
	id: string;
	type: 'function';
	function: { name: string; arguments: string };
}

/** A message as the c0mpute API takes it (OpenAI Chat Completions shape). */
export interface C0mputeMessage {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content: string | null;
	tool_calls?: C0mputeToolCall[];
	tool_call_id?: string;
}

/** An OpenAI function tool definition. */
export interface C0mputeToolDef {
	type: 'function';
	function: { name: string; description?: string; parameters: Record<string, unknown> };
}

export const C0MPUTE_MAX_TOKENS = 8192;

/**
 * Flatten OpenAI style content (a string, or an array of content parts) into a
 * plain string: text parts are joined and non-text parts are dropped (the API
 * is text only).
 */
export function flattenContent(content: unknown): string {
	if (content === null || content === undefined) return '';
	if (typeof content === 'string') return content;
	if (Array.isArray(content)) {
		return content
			.map((part) => {
				if (typeof part === 'string') return part;
				if (part && typeof part === 'object') {
					const p = part as { type?: unknown; text?: unknown };
					if ((p.type === undefined || p.type === 'text') && typeof p.text === 'string') {
						return p.text;
					}
				}
				return '';
			})
			.filter((s) => s !== '')
			.join('\n');
	}
	if (typeof content === 'object') {
		const p = content as { text?: unknown };
		if (typeof p.text === 'string') return p.text;
	}
	return String(content);
}

function stringifyResult(result: unknown): string {
	if (typeof result === 'string') return result;
	try {
		return JSON.stringify(result);
	} catch {
		return String(result);
	}
}

function partToText(part: MessageContent): string {
	switch (part.type) {
		case 'text':
			return part.text;
		case 'tool-call':
			return `[tool call ${part.toolName}: ${part.input}]`;
		case 'tool-result':
			return `[tool result${part.isError ? ' (error)' : ''}: ${stringifyResult(part.result)}]`;
		default:
			// reasoning, files (no image input through the API), citations, provider data
			return '';
	}
}

/**
 * Convert n8n AI SDK messages into OpenAI Chat Completions messages for c0mpute.
 *
 * - Text parts are joined with newlines.
 * - Assistant tool-call parts become `tool_calls`; each tool-result part
 *   becomes a `tool` message with its `tool_call_id` (c0mpute supports tool
 *   calling on `auto` and tool-capable models).
 * - Messages that end up empty are dropped.
 */
export function toC0mputeMessages(messages: Message[]): C0mputeMessage[] {
	const out: C0mputeMessage[] = [];
	let n = 0;
	for (const message of messages) {
		const parts = Array.isArray(message.content) ? message.content : [];
		if (message.role === 'tool') {
			for (const part of parts) {
				if (part.type !== 'tool-result') continue;
				const text = stringifyResult(part.result);
				out.push({ role: 'tool', tool_call_id: part.toolCallId, content: part.isError ? `error: ${text}` : text });
			}
			continue;
		}
		if (message.role === 'assistant') {
			const content = parts
				.filter((p) => p.type === 'text')
				.map(partToText)
				.filter((s) => s !== '')
				.join('\n');
			const toolCalls: C0mputeToolCall[] = [];
			for (const part of parts) {
				if (part.type !== 'tool-call') continue;
				toolCalls.push({
					id: part.toolCallId || `call_n8n_${++n}`,
					type: 'function',
					function: { name: part.toolName, arguments: part.input || '{}' },
				});
			}
			if (toolCalls.length) out.push({ role: 'assistant', content: content || null, tool_calls: toolCalls });
			else if (content.trim() !== '') out.push({ role: 'assistant', content });
			continue;
		}
		const content = parts
			.map(partToText)
			.filter((s) => s !== '')
			.join('\n');
		if (content.trim() === '') continue;
		out.push({ role: message.role === 'system' ? 'system' : 'user', content });
	}
	return out;
}

export function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

/** Build the request body, sending only fields the API honors. */
export function buildChatBody(params: {
	model: string;
	messages: C0mputeMessage[];
	stream?: boolean;
	temperature?: number;
	maxTokens?: number;
	tools?: C0mputeToolDef[];
}): Record<string, unknown> {
	const body: Record<string, unknown> = {
		model: params.model || 'auto',
		messages: params.messages,
	};
	if (params.tools?.length) {
		body.tools = params.tools;
		// n8n's LangChain adapter streams every tool call at index 0, so ask for
		// one call per turn; the agent loops for the next one.
		body.parallel_tool_calls = false;
	}
	if (params.stream) body.stream = true;
	if (typeof params.temperature === 'number' && !Number.isNaN(params.temperature)) {
		body.temperature = clamp(params.temperature, 0, 2);
	}
	if (typeof params.maxTokens === 'number' && params.maxTokens > 0) {
		body.max_tokens = clamp(Math.round(params.maxTokens), 1, C0MPUTE_MAX_TOKENS);
	}
	return body;
}

/** Trim a trailing slash so `${base}/chat/completions` is always well formed. */
export function normalizeBaseUrl(url: unknown, fallback = 'https://c0mpute.com/v1'): string {
	const value = typeof url === 'string' && url.trim() !== '' ? url.trim() : fallback;
	return value.replace(/\/+$/, '');
}

export interface ModelListResponse {
	data?: Array<{ id?: string; owned_by?: string }>;
}

/** Turn a /v1/models response into dropdown options, router aliases first. */
export function modelOptions(response: ModelListResponse): Array<{ name: string; value: string; description?: string }> {
	const ids = (response.data ?? [])
		.map((m) => m.id)
		.filter((id): id is string => typeof id === 'string' && id !== '');
	const unique = Array.from(new Set(ids));
	const aliases = unique.filter((id) => id === 'auto' || id.startsWith('auto:'));
	const concrete = unique.filter((id) => !(id === 'auto' || id.startsWith('auto:'))).sort();
	const order = ['auto', 'auto:fast', 'auto:standard', 'auto:high', 'auto:max'];
	aliases.sort((a, b) => {
		const ia = order.indexOf(a);
		const ib = order.indexOf(b);
		return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
	});
	if (!aliases.includes('auto')) aliases.unshift('auto');
	return [
		...aliases.map((id) => ({
			name: id,
			value: id,
			description: 'Router alias: c0mpute picks a concrete model per request',
		})),
		...concrete.map((id) => ({ name: id, value: id })),
	];
}
