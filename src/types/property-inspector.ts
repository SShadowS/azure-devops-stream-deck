/**
 * Type definitions for Property Inspector communication.
 * These types ensure type safety between the plugin and Property Inspector.
 */

import { PipelineInfo } from '../services/pipeline-service';
import { Repository } from '../services/azure-devops-client';

/**
 * Base message structure for all Property Inspector messages.
 * Includes index signature for Stream Deck SDK compatibility.
 */
interface BaseMessage {
    event: string;
    // Index signature for Stream Deck SDK compatibility
    [key: string]: any;
}

/**
 * Messages sent from Property Inspector to Plugin.
 */
export type PIToPluginMessage = 
    | TestConnectionMessage
    | GetRepositoriesMessage
    | GetDataSourceMessage;

/**
 * Messages sent from Plugin to Property Inspector.
 */
export type PluginToPIMessage = 
    | ConnectionResultMessage
    | RepositoriesResultMessage
    | DataSourceResultMessage
    | DebugLogMessage;

/**
 * Test connection request from Property Inspector.
 * Contains all the connection settings needed to test.
 */
export interface TestConnectionMessage extends BaseMessage {
    event: 'testConnection';
    organizationUrl?: string;
    projectName?: string;
    personalAccessToken?: string;
    pipelineId?: number;
    repositoryId?: string;
    branchName?: string;
    refreshInterval?: number;
    displayFormat?: 'icon' | 'text' | 'both';
    showBuildNumber?: boolean;
    showDuration?: boolean;
}

/**
 * Get repositories request from Property Inspector.
 */
export interface GetRepositoriesMessage extends BaseMessage {
    event: 'getRepositories';
    organizationUrl?: string;
    projectName?: string;
    personalAccessToken?: string;
}

/**
 * Generic data source request (for dropdowns).
 */
export interface GetDataSourceMessage extends BaseMessage {
    event: 'getDataSource';
    datasource: string;
    payload?: any;
}

/**
 * Connection test result sent to Property Inspector.
 */
export interface ConnectionResultMessage extends BaseMessage {
    event: 'connectionResult';
    success: boolean;
    message: string;
    details?: {
        pipelineInfo?: PipelineInfo;
        repositoryCount?: number;
    };
}

/**
 * Repositories list sent to Property Inspector.
 */
export interface RepositoriesResultMessage extends BaseMessage {
    event: 'repositoriesResult';
    success?: boolean;
    repositories?: Repository[];
    message?: string;
    error?: string;
}

/**
 * Generic data source result for dropdowns.
 */
export interface DataSourceResultMessage extends BaseMessage {
    event: 'dataSourceResult';
    datasource: string;
    items: DataSourceItem[];
}

/**
 * Debug log message sent to Property Inspector.
 */
export interface DebugLogMessage extends BaseMessage {
    event: 'debugLog';
    message: string;
    data?: any;
}

/**
 * Item in a data source dropdown.
 */
export interface DataSourceItem {
    value: string;
    label: string;
    disabled?: boolean;
    children?: DataSourceItem[];
}

/**
 * Type guard to check if a message is a test connection request.
 */
export function isTestConnectionMessage(msg: any): msg is TestConnectionMessage {
    return msg?.event === 'testConnection';
}

/**
 * Type guard to check if a message is a get repositories request.
 */
export function isGetRepositoriesMessage(msg: any): msg is GetRepositoriesMessage {
    return msg?.event === 'getRepositories';
}

/**
 * Type guard to check if a message is a data source request.
 */
export function isGetDataSourceMessage(msg: any): msg is GetDataSourceMessage {
    return msg?.event === 'getDataSource' &&
           typeof msg.datasource === 'string';
}

/**
 * Utility to extract the actual payload from various message formats.
 * Handles nested payloads from different SDPIComponents versions.
 */
export function extractMessagePayload(msg: any): any {
    // Handle nested payload structures
    if (msg?.payload?.payload) {
        return msg.payload.payload;
    }
    if (msg?.payload) {
        return msg.payload;
    }
    return msg;
}