import { describe, expect, it } from 'vitest';
import type { StreamChunk } from '@n8n/ai-node-sdk';
import { C0mputeChatModel, mapFinishReason, type C0mputeRequests } from '../nodes/LmChatC0mpute/model';

function sse(lines: string[]): AsyncIterableIterator<Buffer> {
	const enc = Buffer.from(lines.join('\n'));
	// split into awkward chunks to exercise buffering
	const parts = [enc.subarray(0, 7), enc.subarray(7, 40), enc.subarray(40)];
	return (async function* () {
		for (const p of parts) yield p;
	})();
}

function makeModel(overrides: Partial<C0mputeRequests> = {}) {
	const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
	const requests: C0mputeRequests = {
		httpRequest: async (_m, url, body) => {
			calls.push({ url: String(url), body: body as Record<string, unknown> });
			return {
				body: {
					id: 'chatcmpl-1',
					model: 'qwen3:4b',
					choices: [{ message: { role: 'assistant', content: 'Hello!' }, finish_reason: 'stop' }],
					usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
					x_c0mpute_route: { ignored: true },
				},
			};
		},
		openStream: async (_m, url, body) => {
			calls.push({ url: String(url), body: body as Record<string, unknown> });
			return {
				body: sse([
					': status {"queue":1}',
					'',
					'data: {"id":"c1","choices":[{"delta":{"role":"assistant","content":"Hel"}}]}',
					'',
					': status {"eta":2}',
					'',
					'data: {"id":"c1","choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}',
					'',
					'data: [DONE]',
					'',
				]),
			};
		},
		...overrides,
	};
	const model = new C0mputeChatModel('auto', requests, {
		baseUrl: 'https://c0mpute.com/v1',
		temperature: 0.3,
		maxTokens: 50,
	});
	return { model, calls };
}

describe('C0mputeChatModel.generate', () => {
	it('posts string-only messages to /chat/completions and maps the answer', async () => {
		const { model, calls } = makeModel();
		const result = await model.generate([
			{ role: 'system', content: [{ type: 'text', text: 'sys' }] },
			{
				role: 'user',
				content: [
					{ type: 'text', text: 'one' },
					{ type: 'text', text: 'two' },
				],
			},
		]);
		expect(calls[0].url).toBe('https://c0mpute.com/v1/chat/completions');
		expect(calls[0].body).toEqual({
			model: 'auto',
			messages: [
				{ role: 'system', content: 'sys' },
				{ role: 'user', content: 'one\ntwo' },
			],
			temperature: 0.3,
			max_tokens: 50,
		});
		expect(calls[0].body.tools).toBeUndefined();
		expect(result.message).toEqual({ role: 'assistant', content: [{ type: 'text', text: 'Hello!' }] });
		expect(result.finishReason).toBe('stop');
		expect(result.usage).toEqual({ promptTokens: 3, completionTokens: 2, totalTokens: 5 });
	});

	it('never sends bound tools upstream', async () => {
		const { model, calls } = makeModel();
		const withTools = model.withTools([
			{ type: 'function', name: 'weather', description: 'x', inputSchema: {} } as never,
		]);
		await withTools.generate([{ role: 'user', content: [{ type: 'text', text: 'hi' }] }]);
		expect(calls[0].body.tools).toBeUndefined();
		expect(calls[0].body.tool_choice).toBeUndefined();
	});

	it('throws when there is no text to send', async () => {
		const { model } = makeModel();
		await expect(
			model.generate([{ role: 'user', content: [{ type: 'file', data: 'x' }] }]),
		).rejects.toThrow(/no text content/);
	});
});

describe('C0mputeChatModel.stream', () => {
	it('parses SSE, skips status comments and stops at [DONE]', async () => {
		const { model, calls } = makeModel();
		const chunks: StreamChunk[] = [];
		for await (const c of model.stream([{ role: 'user', content: [{ type: 'text', text: 'hi' }] }])) {
			chunks.push(c);
		}
		expect(calls[0].body.stream).toBe(true);
		const text = chunks
			.filter((c): c is Extract<StreamChunk, { type: 'text-delta' }> => c.type === 'text-delta')
			.map((c) => c.delta)
			.join('');
		expect(text).toBe('Hello');
		expect(chunks[chunks.length - 1]).toEqual({ type: 'finish', finishReason: 'stop', usage: undefined });
	});

	it('surfaces an error object in the stream', async () => {
		const { model } = makeModel({
			openStream: async () => ({ body: sse(['data: {"error":{"message":"Network is busy"}}', '']) }),
		});
		const run = async () => {
			const chunks: StreamChunk[] = [];
			for await (const c of model.stream([{ role: 'user', content: [{ type: 'text', text: 'hi' }] }])) {
				chunks.push(c);
			}
			return chunks;
		};
		await expect(run()).rejects.toThrow(/Network is busy/);
	});
});

describe('mapFinishReason', () => {
	it('maps OpenAI reasons', () => {
		expect(mapFinishReason('length')).toBe('length');
		expect(mapFinishReason(null)).toBe('stop');
		expect(mapFinishReason('content_filter')).toBe('content-filter');
		expect(mapFinishReason('weird')).toBe('other');
	});
});
