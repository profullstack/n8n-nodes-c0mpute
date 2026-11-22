import { describe, expect, it } from 'vitest';
import { NodeConnectionTypes } from 'n8n-workflow';
import { C0mputeApi } from '../credentials/C0mputeApi.credentials';
import { C0mpute } from '../nodes/C0mpute/C0mpute.node';
import { LmChatC0mpute } from '../nodes/LmChatC0mpute/LmChatC0mpute.node';
import pkg from '../package.json';

describe('c0mputeApi credential', () => {
	const cred = new C0mputeApi();

	it('has the expected name and fields', () => {
		expect(cred.name).toBe('c0mputeApi');
		const names = cred.properties.map((p) => p.name);
		expect(names).toEqual(['apiKey', 'url']);
		const key = cred.properties.find((p) => p.name === 'apiKey');
		expect(key?.typeOptions?.password).toBe(true);
		expect(cred.properties.find((p) => p.name === 'url')?.default).toBe('https://c0mpute.com/v1');
	});

	it('sends a Bearer token', () => {
		expect(cred.authenticate).toEqual({
			type: 'generic',
			properties: { headers: { Authorization: '=Bearer {{$credentials.apiKey}}' } },
		});
	});

	it('tests against GET /models on the configured base URL', () => {
		expect(cred.test.request.url).toBe('/models');
		expect(cred.test.request.method).toBe('GET');
		expect(cred.test.request.baseURL).toContain('$credentials?.url');
	});
});

describe('c0mpute Chat Model node', () => {
	const node = new LmChatC0mpute();
	const d = node.description;

	it('is a language model sub-node', () => {
		expect(d.name).toBe('lmChatC0mpute');
		expect(d.inputs).toEqual([]);
		expect(d.outputs).toEqual([NodeConnectionTypes.AiLanguageModel]);
		expect(d.credentials?.[0]).toEqual({ name: 'c0mputeApi', required: true });
		expect(d.codex?.subcategories?.AI).toContain('Language Models');
	});

	it('defaults the model to auto and loads the list from the API', () => {
		const model = d.properties.find((p) => p.name === 'model');
		expect(model?.default).toBe('auto');
		expect(model?.typeOptions?.loadOptionsMethod).toBe('getModels');
		expect(typeof node.methods.loadOptions.getModels).toBe('function');
	});

	it('names the tool-capable models for agents', () => {
		const notice = d.properties.find((p) => p.type === 'notice');
		expect(notice?.displayName).toMatch(/tool-capable/i);
		expect(notice?.displayName).toContain('qwen3:4b');
	});
});

describe('c0mpute action node', () => {
	const d = new C0mpute().description;

	it('is a main in/out node usable as a tool', () => {
		expect(d.name).toBe('c0mpute');
		expect(d.inputs).toEqual([NodeConnectionTypes.Main]);
		expect(d.outputs).toEqual([NodeConnectionTypes.Main]);
		expect(d.usableAsTool).toBe(true);
		expect(d.properties.find((p) => p.name === 'model')?.default).toBe('auto');
	});
});

describe('package.json', () => {
	it('meets community node packaging rules', () => {
		expect(pkg.name).toMatch(/^n8n-nodes-/);
		expect(pkg.keywords).toContain('n8n-community-node-package');
		expect(pkg.license).toBe('MIT');
		expect(pkg.n8n.credentials).toEqual(['dist/credentials/C0mputeApi.credentials.js']);
		expect(pkg.n8n.nodes).toHaveLength(2);
		expect((pkg as { dependencies?: object }).dependencies ?? {}).toEqual({});
	});
});
