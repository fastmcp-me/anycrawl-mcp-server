import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';
import {
    ApiResponse,
    CrawlJobResponse,
    CrawlStatusResponse,
    CrawlResultsResponse,
    ScrapeResult,
    SearchResult,
    CrawlOptionsSchema,
    SearchOptionsSchema,
    ScrapeOptionsSchema,
} from './types.js';
import { logger } from './logger.js';

export class AnyCrawlClient {
    private client: AxiosInstance;
    private apiKey: string;
    private baseUrl: string;
    private onAuthFailure?: () => void;

    constructor(apiKey: string, baseUrl: string = 'https://api.anycrawl.dev', onAuthFailure?: () => void) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
        if (onAuthFailure !== undefined) {
            this.onAuthFailure = onAuthFailure;
        }
        this.client = axios.create({
            baseURL: this.baseUrl,
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            timeout: 300000, // 5 minutes
        });

        // Add response interceptor for error handling (runtime)
        this.client.interceptors.response.use(
            (response: AxiosResponse) => response,
            (error: AxiosError) => this.normalizeAxiosError(error)
        );
    }
    private normalizeAxiosError(error: AxiosError | any): never {
        const maybeStatus = (error?.response as any)?.status;
        const maybeData = (error?.response as any)?.data;
        if (maybeStatus !== undefined) {
            const errorMessage = maybeData?.error || maybeData?.message || 'Unknown error';
            if (this.isAuthenticationError(Number(maybeStatus), errorMessage)) {
                logger.warn('Authentication error detected, triggering logout');
                if (this.onAuthFailure) {
                    this.onAuthFailure();
                }
                throw new Error(`Authentication failed: ${errorMessage}. User has been logged out.`);
            }
            throw new Error(`API Error ${maybeStatus}: ${errorMessage}`);
        }
        if (error && error.request) {
            throw new Error('Network error: Unable to reach AnyCrawl API');
        }
        if (error instanceof Error) {
            throw new Error(`Request error: ${error.message}`);
        }
        throw new Error('Unknown request error');
    }


    private isAuthenticationError(status: number, errorMessage: string): boolean {
        // Check for common authentication error patterns
        const authErrorPatterns = [
            /refresh.*token.*failed/i,
            /token.*expired/i,
            /authentication.*failed/i,
            /unauthorized/i,
            /invalid.*token/i,
            /access.*denied/i,
            /something went wrong.*please make sure the data you entered is correct/i
        ];

        // Check status codes
        if (status === 401 || status === 403) {
            return true;
        }

        // Check error message patterns
        return authErrorPatterns.some(pattern => pattern.test(errorMessage));
    }

    setAuthFailureCallback(callback: () => void): void {
        this.onAuthFailure = callback;
    }

    async healthCheck(): Promise<{ status: string }> {
        try {
            const response: AxiosResponse<{ status: string }> = await this.client.get('/health');
            return response.data;
        } catch (error: any) {
            // Normalize in case interceptors are not attached in tests
            return this.normalizeAxiosError(error);
        }
    }

    async scrape(options: {
        url: string;
        engine: string;
        proxy?: string;
        formats?: string[];
        timeout?: number;
        retry?: boolean;
        wait_for?: number;
        include_tags?: string[];
        exclude_tags?: string[];
        json_options?: any;
        extract_source?: 'html' | 'markdown';
    }): Promise<ScrapeResult> {
        try {
            const response: AxiosResponse<ApiResponse<ScrapeResult>> = await this.client.post('/v1/scrape', options);
            if (!response.data.success) {
                throw new Error(response.data.error || 'Scraping failed');
            }
            return response.data.data!;
        } catch (error: any) {
            return this.normalizeAxiosError(error);
        }
    }

    async createCrawl(options: {
        url: string;
        engine: string;
        proxy?: string;
        formats?: string[];
        timeout?: number;
        wait_for?: number;
        retry?: boolean;
        include_tags?: string[];
        exclude_tags?: string[];
        json_options?: any;
        extract_source?: 'html' | 'markdown';
        scrape_options?: {
            proxy?: string;
            formats?: string[];
            timeout?: number;
            wait_for?: number;
            include_tags?: string[];
            exclude_tags?: string[];
            json_options?: any;
        };
        exclude_paths?: string[];
        include_paths?: string[];
        max_depth?: number;
        strategy?: string;
        limit?: number;
    }): Promise<CrawlJobResponse> {
        try {
            const response: AxiosResponse<ApiResponse<CrawlJobResponse>> = await this.client.post('/v1/crawl', options);
            if (!response.data.success) {
                throw new Error(response.data.error || 'Crawl creation failed');
            }
            return response.data.data!;
        } catch (error: any) {
            return this.normalizeAxiosError(error);
        }
    }

    async getCrawlStatus(jobId: string): Promise<CrawlStatusResponse> {
        try {
            const response: AxiosResponse<ApiResponse<CrawlStatusResponse>> = await this.client.get(`/v1/crawl/${jobId}/status`);
            if (!response.data.success) {
                throw new Error(response.data.error || 'Failed to get crawl status');
            }
            return response.data.data!;
        } catch (error: any) {
            return this.normalizeAxiosError(error);
        }
    }

    async getCrawlResults(jobId: string, skip: number = 0): Promise<CrawlResultsResponse> {
        try {
            const response: AxiosResponse<CrawlResultsResponse> = await this.client.get(`/v1/crawl/${jobId}?skip=${skip}`);
            return response.data;
        } catch (error: any) {
            return this.normalizeAxiosError(error);
        }
    }

    async cancelCrawl(jobId: string): Promise<{ job_id: string; status: string }> {
        try {
            const response: AxiosResponse<ApiResponse<{ job_id: string; status: string }>> = await this.client.delete(`/v1/crawl/${jobId}`);
            if (!response.data.success) {
                throw new Error(response.data.error || 'Failed to cancel crawl');
            }
            return response.data.data!;
        } catch (error: any) {
            return this.normalizeAxiosError(error);
        }
    }

    async search(options: {
        query: string;
        engine?: string;
        limit?: number;
        offset?: number;
        pages?: number;
        lang?: string;
        country?: string;
        scrape_options: {
            proxy?: string;
            formats?: string[];
            timeout?: number;
            wait_for?: number;
            include_tags?: string[];
            exclude_tags?: string[];
            json_options?: any;
            engine: string;
        };
        safeSearch?: number | null;
    }): Promise<SearchResult[]> {
        try {
            const response: AxiosResponse<ApiResponse<SearchResult[]>> = await this.client.post('/v1/search', options);
            if (!response.data.success) {
                throw new Error(response.data.error || 'Search failed');
            }
            return response.data.data!;
        } catch (error: any) {
            return this.normalizeAxiosError(error);
        }
    }
}
