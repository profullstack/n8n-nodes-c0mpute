import { describe, expect, it } from 'vitest';
import type { IHttpRequestOptions } from 'n8n-workflow';
import { C0mpute } from '../nodes/C0mpute/C0mpute.node';
import { executeContext } from './helpers';

const completion = {
	id: 'x',
	model: 'qwen3:4b',
	choices: [{ message: { role: 'assistant', content: 'Paris' }, finish_reason: 'stop' }],
	usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
};

describe('c0mpute action node execute', () => {
	it('sends a system + user message and returns simplified output', async () => {
		const seen: IHttpRequestOptions[] = [];
		const ctx = executeContext({
			params: {
				model: 'auto',
				prompt: 'Capital of France?',
				options: { systemMessage: 'One word.', temperature: 0.2, maxTokens: 10 },
			},
			request: async (o) => {
				seen.push(o);
				return completion;
			},
		});
		const [out] = await new C0mpute().execute.call(ctx);
		expect(seen[0].url).toBe('https://c0mpute.com/v1/chat/completions');
		expect(seen[0].method).toBe('POST');
		expect(seen[0].body).toEqual({
			model: 'auto',
			messages: [
				{ role: 'system', content: 'One word.' },
				{ role: 'user', content: 'Capital of France?' },
			],
			temperature: 0.2,
			max_tokens: 10,
		});
		expect(out[0].json).toEqual({
			text: 'Paris',
			model: 'qwen3:4b',
			finish_reason: 'stop',
			usage: completion.usage,
		});
		expect(out[0].pairedItem).toEqual({ item: 0 });
	});

	it('returns the raw response when simplify is off', async () => {
		const ctx = executeContext({
			params: { model: 'auto', prompt: 'hi', options: { simplify: false } },
			request: async () => completion,
		});
		const [out] = await new C0mpute().execute.call(ctx);
		expect(out[0].json).toEqual(completion);
	});

	it('reports errors per item with continueOnFail', async () => {
		const ctx = executeContext({
			params: { model: 'auto', prompt: 'hi', options: {} },
			items: 2,
			continueOnFail: true,
			request: async () => {
				throw new Error('Network is busy. Run a node or wait.');
			},
		});
		const [out] = await new C0mpute().execute.call(ctx);
		expect(out).toHaveLength(2);
		expect(out[0].json.error).toBeTruthy();
	});

	it('rejects an empty prompt', async () => {
		const ctx = executeContext({
			params: { model: 'auto', prompt: '  ', options: {} },
			request: async () => completion,
		});
		await expect(new C0mpute().execute.call(ctx)).rejects.toThrow(/prompt is empty/);
	});
});
