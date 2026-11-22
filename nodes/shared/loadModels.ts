import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { modelOptions, normalizeBaseUrl, type ModelListResponse } from './messages';

export async function getModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const credentials = await this.getCredentials('c0mputeApi');
	const baseUrl = normalizeBaseUrl(credentials.url);
	const response = (await this.helpers.httpRequestWithAuthentication.call(this, 'c0mputeApi', {
		method: 'GET',
		url: `${baseUrl}/models`,
		json: true,
	})) as ModelListResponse;
	return modelOptions(response);
}
