import * as azdev from 'azure-devops-node-api';
import * as BuildApi from 'azure-devops-node-api/BuildApi';
import streamDeck from '@elgato/streamdeck';

export interface AzureDevOpsConfig {
    organizationUrl: string;
    personalAccessToken: string;
    projectName: string;
}

export class AzureDevOpsClient {
    private connection: azdev.WebApi | null = null;
    private buildApi: BuildApi.IBuildApi | null = null;
    private config: AzureDevOpsConfig | null = null;
    private logger = streamDeck.logger.createScope('AzureDevOpsClient');
    private connectionValidated = false;
    private lastConnectionAttempt = 0;
    private readonly CONNECTION_RETRY_INTERVAL = 30000; // 30 seconds

    constructor() {
        this.logger.debug('AzureDevOpsClient initialized');
    }

    public async connect(config: AzureDevOpsConfig): Promise<void> {
        try {
            const now = Date.now();
            if (this.lastConnectionAttempt && (now - this.lastConnectionAttempt) < this.CONNECTION_RETRY_INTERVAL) {
                throw new Error('Connection attempt too soon after previous failure');
            }

            this.lastConnectionAttempt = now;
            this.config = config;
            
            if (!config.organizationUrl || !config.personalAccessToken || !config.projectName) {
                throw new Error('Missing required configuration: organizationUrl, personalAccessToken, or projectName');
            }

            const authHandler = azdev.getPersonalAccessTokenHandler(config.personalAccessToken);
            this.connection = new azdev.WebApi(config.organizationUrl, authHandler);
            this.buildApi = await this.connection.getBuildApi();
            
            await this.validateConnection();
            this.connectionValidated = true;
            this.logger.info('Successfully connected to Azure DevOps');
        } catch (error) {
            this.connectionValidated = false;
            this.connection = null;
            this.buildApi = null;
            this.logger.error('Failed to connect to Azure DevOps', error);
            throw error;
        }
    }

    public async validateConnection(): Promise<boolean> {
        if (!this.buildApi || !this.config) {
            throw new Error('Client not connected. Call connect() first.');
        }

        try {
            const builds = await this.buildApi.getBuilds(
                this.config.projectName,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                1
            );
            
            this.logger.debug(`Connection validated. Found ${builds.length} build(s)`);
            return true;
        } catch (error) {
            this.logger.error('Connection validation failed', error);
            throw new Error(`Failed to validate connection: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    public isConnected(): boolean {
        return this.connectionValidated && this.connection !== null && this.buildApi !== null;
    }

    public getBuildApi(): BuildApi.IBuildApi {
        if (!this.buildApi) {
            throw new Error('Client not connected. Call connect() first.');
        }
        return this.buildApi;
    }

    public getProjectName(): string {
        if (!this.config) {
            throw new Error('Client not configured');
        }
        return this.config.projectName;
    }

    public disconnect(): void {
        this.connection = null;
        this.buildApi = null;
        this.connectionValidated = false;
        this.config = null;
        this.logger.debug('Disconnected from Azure DevOps');
    }

    public async retryWithExponentialBackoff<T>(
        operation: () => Promise<T>,
        maxRetries: number = 3,
        initialDelay: number = 1000
    ): Promise<T> {
        let lastError: Error | unknown;
        
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                const delay = initialDelay * Math.pow(2, attempt);
                this.logger.warn(`Operation failed (attempt ${attempt + 1}/${maxRetries}). Retrying in ${delay}ms...`);
                
                if (attempt < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        
        this.logger.error('All retry attempts failed', lastError);
        throw lastError;
    }
}