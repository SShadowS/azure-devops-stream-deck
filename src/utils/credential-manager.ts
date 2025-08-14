import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { Logger } from '@elgato/streamdeck';

/**
 * Manages secure storage and retrieval of sensitive credentials
 */
export class CredentialManager {
    private readonly logger: Logger;
    private readonly algorithm = 'aes-256-gcm';
    private readonly saltLength = 32;
    private readonly tagLength = 16;
    private readonly ivLength = 16;
    private readonly keyLength = 32;
    
    // Use a device-specific key derivation
    private readonly masterPassword: string;

    constructor(logger: Logger) {
        this.logger = logger;
        // In production, this should be derived from device-specific information
        // For now, using a hardcoded value with environment variable override
        this.masterPassword = process.env.CREDENTIAL_MASTER_KEY || 'streamdeck-azure-devops-default-key';
    }

    /**
     * Encrypts a credential string
     * @param credential The plain text credential to encrypt
     * @returns Encrypted credential with salt, iv, tag, and ciphertext
     */
    public encrypt(credential: string): string {
        try {
            // Generate random salt and IV
            const salt = randomBytes(this.saltLength);
            const iv = randomBytes(this.ivLength);
            
            // Derive key from master password and salt
            const key = scryptSync(this.masterPassword, salt as any, this.keyLength) as Buffer;
            
            // Create cipher
            const cipher = createCipheriv(this.algorithm, key as any, iv as any);
            
            // Encrypt the credential
            const encrypted = Buffer.concat([
                cipher.update(credential, 'utf8') as any,
                cipher.final() as any
            ] as any);
            
            // Get the authentication tag
            const tag = cipher.getAuthTag();
            
            // Combine salt, iv, tag, and encrypted data
            const combined = Buffer.concat([salt, iv, tag, encrypted] as any);
            
            // Return as base64 string
            return combined.toString('base64');
        } catch (error) {
            this.logger.error('Failed to encrypt credential', error);
            throw new Error('Credential encryption failed');
        }
    }

    /**
     * Decrypts an encrypted credential string
     * @param encryptedCredential The encrypted credential string
     * @returns The decrypted plain text credential
     */
    public decrypt(encryptedCredential: string): string {
        try {
            // Convert from base64
            const combined = Buffer.from(encryptedCredential, 'base64');
            
            // Extract components
            const salt = combined.subarray(0, this.saltLength);
            const iv = combined.subarray(this.saltLength, this.saltLength + this.ivLength);
            const tag = combined.subarray(
                this.saltLength + this.ivLength,
                this.saltLength + this.ivLength + this.tagLength
            );
            const encrypted = combined.subarray(this.saltLength + this.ivLength + this.tagLength);
            
            // Derive key from master password and salt
            const key = scryptSync(this.masterPassword, salt as any, this.keyLength) as Buffer;
            
            // Create decipher
            const decipher = createDecipheriv(this.algorithm, key as any, iv as any);
            decipher.setAuthTag(tag as any);
            
            // Decrypt the credential
            const decrypted = Buffer.concat([
                decipher.update(encrypted as any),
                decipher.final() as any
            ] as any);
            
            return decrypted.toString('utf8');
        } catch (error) {
            this.logger.error('Failed to decrypt credential', error);
            throw new Error('Credential decryption failed');
        }
    }

    /**
     * Validates a Personal Access Token format
     * @param token The token to validate
     * @returns true if the token appears valid
     */
    public validatePAT(token: string): boolean {
        if (!token || typeof token !== 'string') {
            return false;
        }

        // Remove any whitespace
        const trimmedToken = token.trim();
        
        // Basic validation rules for Azure DevOps PAT
        // PATs are typically 52 characters long and alphanumeric
        if (trimmedToken.length < 20 || trimmedToken.length > 100) {
            return false;
        }
        
        // Check for valid characters (alphanumeric plus some special chars)
        const patPattern = /^[a-zA-Z0-9_\-]+$/;
        if (!patPattern.test(trimmedToken)) {
            return false;
        }
        
        return true;
    }

    /**
     * Securely stores credentials in Stream Deck global settings
     * @param settings The global settings object
     * @param key The settings key to store under
     * @param credential The credential to store
     */
    public storeCredential(settings: any, key: string, credential: string): void {
        if (!credential) {
            delete settings[key];
            return;
        }
        
        const encrypted = this.encrypt(credential);
        settings[key] = {
            encrypted: true,
            value: encrypted,
            timestamp: Date.now()
        };
    }

    /**
     * Retrieves and decrypts credentials from Stream Deck global settings
     * @param settings The global settings object
     * @param key The settings key to retrieve from
     * @returns The decrypted credential or null if not found
     */
    public retrieveCredential(settings: any, key: string): string | null {
        const stored = settings[key];
        
        if (!stored || !stored.encrypted || !stored.value) {
            return null;
        }
        
        try {
            return this.decrypt(stored.value);
        } catch (error) {
            this.logger.error(`Failed to retrieve credential for key: ${key}`, error);
            return null;
        }
    }

    /**
     * Checks if a stored credential has expired
     * @param settings The global settings object
     * @param key The settings key to check
     * @param maxAgeMs Maximum age in milliseconds (default: 90 days)
     * @returns true if the credential has expired or doesn't exist
     */
    public isCredentialExpired(settings: any, key: string, maxAgeMs: number = 90 * 24 * 60 * 60 * 1000): boolean {
        const stored = settings[key];
        
        if (!stored || !stored.timestamp) {
            return true;
        }
        
        const age = Date.now() - stored.timestamp;
        return age > maxAgeMs;
    }

    /**
     * Removes a credential from storage
     * @param settings The global settings object
     * @param key The settings key to remove
     */
    public removeCredential(settings: any, key: string): void {
        delete settings[key];
    }

    /**
     * Migrates unencrypted credentials to encrypted storage
     * @param settings The global settings object
     * @param key The settings key to migrate
     * @returns true if migration was performed
     */
    public migrateCredential(settings: any, key: string): boolean {
        const value = settings[key];
        
        // Check if it's already encrypted
        if (typeof value === 'object' && value.encrypted) {
            return false;
        }
        
        // Check if it's a plain string that needs encryption
        if (typeof value === 'string' && value.length > 0) {
            this.storeCredential(settings, key, value);
            this.logger.info(`Migrated credential for key: ${key}`);
            return true;
        }
        
        return false;
    }
}

export default CredentialManager;