import { describe, expect, it } from 'vitest';
import type { Message } from '@n8n/ai-node-sdk';
import {
	buildChatBody,
	flattenContent,
	modelOptions,
	normalizeBaseUrl,
	toC0mputeMessages,
} from '../nodes/shared/messages';

describe('flattenContent', () => {
	it('passes strings through', () => {
		expect(flattenContent('hello')).toBe('hello');
	});

	it('joins text-only content arrays into one string', () => {
		expect(
			flattenContent([
				{ type: 'text', text: 'line one' },
				{ type: 'text', text: 'line two' },
			]),
		).toBe('line one\nline two');
	});

	it('drops non-text parts such as images', () => {
		expect(
			flattenContent([
				{ type: 'image_url', image_url: { url: 'data:...' } },
				{ type: 'text', text: 'caption' },
			]),
		).toBe('caption');
	});

	it('handles null, undefined and objects with text', () => {
		expect(flattenContent(null)).toBe('');
		expect(flattenContent(undefined)).toBe('');
		expect(flattenContent({ text: 'x' })).toBe('x');
	});
});

describe('toC0mputeMessages', () => {
	it('flattens SDK messages to role + string content', () => {
		const messages: Message[] = [
			{ role: 'system', content: [{ type: 'text', text: 'be brief' }] },
			{
				role: 'user',
				content: [
					{ type: 'text', text: 'a' },
					{ type: 'text', text: 'b' },
				],
			},
			{ role: 'assistant', content: [{ type: 'text', text: 'ok' }] },
		];
		const out = toC0mputeMessages(messages);
		expect(out).toEqual([
			{ role: 'system', content: 'be brief' },
			{ role: 'user', content: 'a\nb' },
			{ role: 'assistant', content: 'ok' },
		]);
		for (const m of out) expect(typeof m.content).toBe('string');
	});

	it('maps assistant tool calls and tool results to OpenAI tool messages', () => {
		const out = toC0mputeMessages([
			{
				role: 'assistant',
				content: [{ type: 'tool-call', toolCallId: 'call_1', toolName: 'weather', input: '{"city":"Paris"}' }],
			},
			{
				role: 'tool',
				content: [{ type: 'tool-result', toolCallId: 'call_1', result: { temp: 20 } }],
			},
			{
				role: 'tool',
				content: [{ type: 'tool-result', toolCallId: 'call_2', result: 'boom', isError: true }],
			},
		]);
		expect(out).toEqual([
			{
				role: 'assistant',
				content: null,
				tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'weather', arguments: '{"city":"Paris"}' } }],
			},
			{ role: 'tool', tool_call_id: 'call_1', content: '{"temp":20}' },
			{ role: 'tool', tool_call_id: 'call_2', content: 'error: boom' },
		]);
	});

	it('drops reasoning, files and empty messages', () => {
		const out = toC0mputeMessages([
			{ role: 'assistant', content: [{ type: 'reasoning', text: 'hmm' }] },
			{ role: 'user', content: [{ type: 'file', data: 'abc', mediaType: 'image/png' }] },
			{ role: 'user', content: [{ type: 'text', text: 'hi' }] },
		]);
		expect(out).toEqual([{ role: 'user', content: 'hi' }]);
	});
});

describe('buildChatBody', () => {
	it('sends only honored fields and clamps limits', () => {
		const body = buildChatBody({
			model: '',
			messages: [{ role: 'user', content: 'hi' }],
			stream: true,
			temperature: 5,
			maxTokens: 99999,
		});
		expect(body).toEqual({
			model: 'auto',
			messages: [{ role: 'user', content: 'hi' }],
			stream: true,
			temperature: 2,
			max_tokens: 8192,
		});
	});

	it('omits optional fields when unset', () => {
		expect(buildChatBody({ model: 'qwen3:4b', messages: [] })).toEqual({
			model: 'qwen3:4b',
			messages: [],
		});
	});
});

describe('normalizeBaseUrl', () => {
	it('defaults and trims trailing slashes', () => {
		expect(normalizeBaseUrl(undefined)).toBe('https://c0mpute.com/v1');
		expect(normalizeBaseUrl('')).toBe('https://c0mpute.com/v1');
		expect(normalizeBaseUrl('https://example.com/v1///')).toBe('https://example.com/v1');
	});
});

describe('modelOptions', () => {
	it('lists router aliases first in a fixed order, then sorted concrete models', () => {
		const opts = modelOptions({
			data: [
				{ id: 'qwen3:4b' },
				{ id: 'auto:high' },
				{ id: 'auto' },
				{ id: 'devstral:24b' },
				{ id: 'auto:fast' },
				{ id: 'qwen3:4b' },
			],
		});
		expect(opts.map((o) => o.value)).toEqual([
			'auto',
			'auto:fast',
			'auto:high',
			'devstral:24b',
			'qwen3:4b',
		]);
	});

	it('always offers auto', () => {
		expect(modelOptions({ data: [] }).map((o) => o.value)).toEqual(['auto']);
	});
});
