/**
 * Live tests against the real c0mpute API. Skipped unless C0MPUTE_API_KEY is set.
 * The key is only ever sent as a request header; it is never logged.
 */
import { describe, expect, it } from 'vitest';
import type { IHttpRequestOptions } from 'n8n-workflow';
import { C0mputeChatModel } from '../nodes/LmChatC0mpute/model';
import { C0mpute } from '../nodes/C0mpute/C0mpute.node';
import { executeContext } from './helpers';

const key = process.env.C0MPUTE_API_KEY;
const base = 'https://c0mpute.com/v1';
const live = key ? describe : describe.skip;

async function post(url: string, body: unknown, stream = false) {
	const res = await fetch(url, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${key}`,
			'Content-Type': 'application/json',
			Accept: stream ? 'text/event-stream' : 'application/json',
		},
		body: JSON.stringify(body),
	});
	if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
	return res;
}

live('live c0mpute API', () => {
	const model = new C0mputeChatModel(
		'auto',
		{
			httpRequest: async (_m, url, body) => ({ body: await (await post(String(url), body)).json() }),
			openStream: async (_m, url, body) => ({
				body: (await post(String(url), body, true)).body as unknown as AsyncIterableIterator<Uint8Array>,
			}),
		},
		{ baseUrl: base, temperature: 0, maxTokens: 64 },
	);

	it('chat model generate() answers', async () => {
		const r = await model.generate([
			{ role: 'system', content: [{ type: 'text', text: 'Answer with one word.' }] },
			{ role: 'user', content: [{ type: 'text', text: 'What color is the sky on a clear day?' }] },
		]);
		const text = r.message.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
		console.log('generate ->', JSON.stringify(text.slice(0, 120)));
		expect(text.length).toBeGreaterThan(0);
	}, 180000);

	it('chat model stream() answers', async () => {
		let text = '';
		let finished = false;
		for await (const c of model.stream([
			{ role: 'user', content: [{ type: 'text', text: 'Say hello in three words.' }] },
		])) {
			if (c.type === 'text-delta') text += c.delta;
			if (c.type === 'finish') finished = true;
		}
		console.log('stream ->', JSON.stringify(text.slice(0, 120)));
		expect(text.length).toBeGreaterThan(0);
		expect(finished).toBe(true);
	}, 180000);

	it('action node execute() answers', async () => {
		const ctx = executeContext({
			url: base,
			params: { model: 'auto', prompt: 'What is 2 + 2? Reply with the number only.', options: { maxTokens: 32 } },
			request: async (o: IHttpRequestOptions) => (await post(String(o.url), o.body)).json(),
		});
		const [out] = await new C0mpute().execute.call(ctx);
		console.log('action ->', JSON.stringify(out[0].json).slice(0, 200));
		expect(String(out[0].json.text).length).toBeGreaterThan(0);
	}, 180000);
});
