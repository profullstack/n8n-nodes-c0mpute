import type {
	INodeType,
	INodeTypeDescription,
	ISupplyDataFunctions,
	SupplyData,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';
import { supplyModel } from '@n8n/ai-node-sdk';
import { C0mputeChatModel } from './model';
import { normalizeBaseUrl } from '../shared/messages';
import { getModels } from '../shared/loadModels';
import {
	maxTokensOption,
	modelProperty,
	temperatureOption,
	timeoutOption,
} from '../shared/properties';

type ModelOptions = {
	temperature?: number;
	maxTokens?: number;
	timeout?: number;
};

export class LmChatC0mpute implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'c0mpute Chat Model',
		name: 'lmChatC0mpute',
		icon: { light: 'file:../../icons/c0mpute.svg', dark: 'file:../../icons/c0mpute.dark.svg' },
		group: ['transform'],
		version: [1],
		subtitle: '={{$parameter["model"]}}',
		description:
			'Open-weight models on the c0mpute peer-to-peer network. Works with chains and plain chat; tool calling is not supported yet.',
		defaults: {
			name: 'c0mpute Chat Model',
		},
		codex: {
			categories: ['AI'],
			subcategories: {
				AI: ['Language Models', 'Root Nodes'],
				'Language Models': ['Chat Models (Recommended)'],
			},
			resources: {
				primaryDocumentation: [{ url: 'https://github.com/profullstack/n8n-nodes-c0mpute#readme' }],
			},
		},
		inputs: [],
		outputs: [NodeConnectionTypes.AiLanguageModel],
		outputNames: ['Model'],
		credentials: [
			{
				name: 'c0mputeApi',
				required: true,
			},
		],
		properties: [
			{
				displayName:
					'The c0mpute API does not support tool calling yet. In an AI Agent, connected tools will not be invoked. Use a Basic LLM Chain or an agent without tools.',
				name: 'toolsNotice',
				type: 'notice',
				default: '',
			},
			modelProperty,
			{
				displayName: 'Options',
				name: 'options',
				placeholder: 'Add Option',
				description: 'Additional options to add',
				type: 'collection',
				default: {},
				options: [maxTokensOption, temperatureOption, timeoutOption],
			},
		],
	};

	methods = {
		loadOptions: {
			getModels,
		},
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		const credentials = await this.getCredentials('c0mputeApi');
		const modelName = this.getNodeParameter('model', itemIndex, 'auto') as string;
		const options = this.getNodeParameter('options', itemIndex, {}) as ModelOptions;
		const timeout = options.timeout ?? 300000;

		const model = new C0mputeChatModel(
			modelName,
			{
				httpRequest: async (method, url, body) => {
					const response: unknown = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'c0mputeApi',
						{ method, url, body, json: true, timeout },
					);
					return { body: response };
				},
				openStream: async (method, url, body) => {
					const response = (await this.helpers.httpRequestWithAuthentication.call(
						this,
						'c0mputeApi',
						{
							method,
							url,
							body,
							json: true,
							timeout,
							encoding: 'stream',
							headers: { Accept: 'text/event-stream' },
						},
					)) as AsyncIterableIterator<Buffer | Uint8Array>;
					return { body: response };
				},
			},
			{
				baseUrl: normalizeBaseUrl(credentials.url),
				temperature: options.temperature,
				maxTokens: options.maxTokens,
			},
		);

		return supplyModel(this, model);
	}
}
