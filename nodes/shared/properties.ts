import type { INodeProperties } from 'n8n-workflow';

export const modelProperty: INodeProperties = {
	displayName: 'Model Name or ID',
	name: 'model',
	type: 'options',
	description:
		'The model that generates the completion. "auto" lets the c0mpute router pick a model per request. A listed model may have no live node at a given moment. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	typeOptions: {
		loadOptionsMethod: 'getModels',
	},
	default: 'auto',
};

export const temperatureOption: INodeProperties = {
	displayName: 'Sampling Temperature',
	name: 'temperature',
	type: 'number',
	default: 0.7,
	typeOptions: { minValue: 0, maxValue: 2, numberPrecision: 1 },
	description: 'Controls randomness. Lower values give more focused, repeatable answers.',
};

export const maxTokensOption: INodeProperties = {
	displayName: 'Maximum Number of Tokens',
	name: 'maxTokens',
	type: 'number',
	default: 1024,
	typeOptions: { minValue: 1, maxValue: 8192 },
	description: 'The maximum number of tokens to generate (the API caps this at 8192)',
};

export const timeoutOption: INodeProperties = {
	displayName: 'Timeout',
	name: 'timeout',
	type: 'number',
	default: 300000,
	typeOptions: { minValue: 1000 },
	description:
		'Maximum time in milliseconds to wait for an answer. Jobs go through a sealed-bid auction and a node queue, so answers can take a minute or more.',
};
