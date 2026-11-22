import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import {
	buildChatBody,
	flattenContent,
	normalizeBaseUrl,
	type C0mputeMessage,
} from '../shared/messages';
import { getModels } from '../shared/loadModels';
import {
	maxTokensOption,
	modelProperty,
	temperatureOption,
	timeoutOption,
} from '../shared/properties';

type ChatOptions = {
	systemMessage?: string;
	temperature?: number;
	maxTokens?: number;
	timeout?: number;
	simplify?: boolean;
};

interface ChatCompletion {
	id?: string;
	model?: string;
	choices?: Array<{ message?: { role?: string; content?: unknown }; finish_reason?: string | null }>;
	usage?: IDataObject;
}

export class C0mpute implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'c0mpute',
		name: 'c0mpute',
		icon: { light: 'file:../../icons/c0mpute.svg', dark: 'file:../../icons/c0mpute.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{"Message " + $parameter["model"]}}',
		description: 'Chat with open-weight models on the c0mpute peer-to-peer network',
		defaults: {
			name: 'c0mpute',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'c0mputeApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Message a Model',
						value: 'message',
						action: 'Message a model',
						description: 'Send a prompt and get a chat completion',
					},
				],
				default: 'message',
			},
			modelProperty,
			{
				displayName: 'Prompt',
				name: 'prompt',
				type: 'string',
				typeOptions: { rows: 4 },
				required: true,
				default: '',
				placeholder: 'e.g. Summarize this text in one sentence',
				description: 'The user message to send',
			},
			{
				displayName: 'Options',
				name: 'options',
				placeholder: 'Add Option',
				type: 'collection',
				default: {},
				options: [
					maxTokensOption,
					temperatureOption,
					{
						displayName: 'Simplify Output',
						name: 'simplify',
						type: 'boolean',
						default: true,
						description:
							'Whether to return only the answer text, model, finish reason and usage instead of the raw API response',
					},
					{
						displayName: 'System Message',
						name: 'systemMessage',
						type: 'string',
						typeOptions: { rows: 3 },
						default: '',
						description: 'Optional instructions sent before the prompt',
					},
					timeoutOption,
				],
			},
		],
	};

	methods = {
		loadOptions: {
			getModels,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const credentials = await this.getCredentials('c0mputeApi');
		const baseUrl = normalizeBaseUrl(credentials.url);

		for (let i = 0; i < items.length; i++) {
			try {
				const model = this.getNodeParameter('model', i, 'auto') as string;
				const prompt = this.getNodeParameter('prompt', i) as string;
				const options = this.getNodeParameter('options', i, {}) as ChatOptions;

				if (!prompt || prompt.trim() === '') {
					throw new NodeOperationError(this.getNode(), 'The prompt is empty', { itemIndex: i });
				}

				const messages: C0mputeMessage[] = [];
				if (options.systemMessage && options.systemMessage.trim() !== '') {
					messages.push({ role: 'system', content: options.systemMessage });
				}
				messages.push({ role: 'user', content: prompt });

				const body = buildChatBody({
					model,
					messages,
					temperature: options.temperature,
					maxTokens: options.maxTokens,
				});

				let response: ChatCompletion;
				try {
					response = (await this.helpers.httpRequestWithAuthentication.call(this, 'c0mputeApi', {
						method: 'POST',
						url: `${baseUrl}/chat/completions`,
						body,
						json: true,
						timeout: options.timeout ?? 300000,
					})) as ChatCompletion;
				} catch (error) {
					throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i });
				}

				const simplify = options.simplify !== false;
				const json: IDataObject = simplify
					? {
							text: flattenContent(response.choices?.[0]?.message?.content),
							model: response.model ?? model,
							finish_reason: response.choices?.[0]?.finish_reason ?? null,
							usage: response.usage ?? null,
						}
					: (response as unknown as IDataObject);

				returnData.push({ json, pairedItem: { item: i } });
			} catch (error) {
				const nodeError =
					error instanceof NodeApiError || error instanceof NodeOperationError
						? error
						: new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: nodeError.message },
						pairedItem: { item: i },
					});
					continue;
				}
				throw nodeError;
			}
		}

		return [returnData];
	}
}
