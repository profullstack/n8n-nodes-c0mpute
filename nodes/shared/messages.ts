import type { Message, MessageContent } from '@n8n/ai-node-sdk';

/** The only message shape the c0mpute API accepts. */
export interface C0mputeMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export const C0MPUTE_MAX_TOKENS = 8192;

/**
 * Flatten OpenAI style content (a string, or an array of content parts) into a
 * plain string. The c0mpute API rejects array content with HTTP 400, even when
 * every part is text, so text parts are joined and non-text parts are dropped.
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
 * Convert n8n AI SDK messages into what the c0mpute API accepts:
 * role system|user|assistant and string content only.
 *
 * - Text parts are joined with newlines.
 * - Tool messages (which the API answers with HTTP 400) become user messages
 *   carrying the tool result as text, so a conversation never breaks.
 * - Messages that end up empty are dropped.
 */
export function toC0mputeMessages(messages: Message[]): C0mputeMessage[] {
	const out: C0mputeMessage[] = [];
	for (const message of messages) {
		const content = (Array.isArray(message.content) ? message.content : [])
			.map(partToText)
			.filter((s) => s !== '')
			.join('\n');
		if (content.trim() === '') continue;
		const role: C0mputeMessage['role'] =
			message.role === 'system' || message.role === 'assistant' ? message.role : 'user';
		out.push({ role, content });
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
}): Record<string, unknown> {
	const body: Record<string, unknown> = {
		model: params.model || 'auto',
		messages: params.messages,
	};
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
