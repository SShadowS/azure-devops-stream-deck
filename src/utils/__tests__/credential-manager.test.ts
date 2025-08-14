import { CredentialManager } from '../credential-manager';
import { Logger } from '@elgato/streamdeck';

// Mock Logger
const mockLogger: Partial<Logger> = {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn()
};

describe('CredentialManager', () => {
    let credentialManager: CredentialManager;
    let testSettings: any;

    beforeEach(() => {
        credentialManager = new CredentialManager(mockLogger as Logger);
        testSettings = {};
        jest.clearAllMocks();
    });

    describe('encrypt and decrypt', () => {
        it('should encrypt and decrypt a credential successfully', () => {
            const originalCredential = 'my-secret-token-12345';
            
            const encrypted = credentialManager.encrypt(originalCredential);
            expect(encrypted).toBeDefined();
            expect(encrypted).not.toBe(originalCredential);
            expect(typeof encrypted).toBe('string');
            
            const decrypted = credentialManager.decrypt(encrypted);
            expect(decrypted).toBe(originalCredential);
        });

        it('should produce different encrypted values for the same input', () => {
            const credential = 'test-token';
            
            const encrypted1 = credentialManager.encrypt(credential);
            const encrypted2 = credentialManager.encrypt(credential);
            
            // Due to random salt and IV, encrypted values should be different
            expect(encrypted1).not.toBe(encrypted2);
            
            // But both should decrypt to the same value
            expect(credentialManager.decrypt(encrypted1)).toBe(credential);
            expect(credentialManager.decrypt(encrypted2)).toBe(credential);
        });

        it('should handle empty strings', () => {
            const encrypted = credentialManager.encrypt('');
            const decrypted = credentialManager.decrypt(encrypted);
            expect(decrypted).toBe('');
        });

        it('should handle special characters', () => {
            const credential = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`';
            const encrypted = credentialManager.encrypt(credential);
            const decrypted = credentialManager.decrypt(encrypted);
            expect(decrypted).toBe(credential);
        });

        it('should throw error for invalid encrypted data', () => {
            expect(() => {
                credentialManager.decrypt('invalid-base64-@#$%');
            }).toThrow('Credential decryption failed');
            
            expect(mockLogger.error).toHaveBeenCalled();
        });
    });

    describe('validatePAT', () => {
        it('should validate correct PAT format', () => {
            expect(credentialManager.validatePAT('abcdef1234567890ABCDEF1234567890')).toBe(true);
            expect(credentialManager.validatePAT('a'.repeat(52))).toBe(true);
            expect(credentialManager.validatePAT('token_with-dash-underscore123')).toBe(true);
        });

        it('should reject invalid PAT formats', () => {
            expect(credentialManager.validatePAT('')).toBe(false);
            expect(credentialManager.validatePAT(null as any)).toBe(false);
            expect(credentialManager.validatePAT(undefined as any)).toBe(false);
            expect(credentialManager.validatePAT('short')).toBe(false);
            expect(credentialManager.validatePAT('a'.repeat(101))).toBe(false);
            expect(credentialManager.validatePAT('token with spaces')).toBe(false);
            expect(credentialManager.validatePAT('token@with#special$chars')).toBe(false);
        });

        it('should handle whitespace in tokens', () => {
            expect(credentialManager.validatePAT('  validtoken1234567890ABCDEF  ')).toBe(true);
            expect(credentialManager.validatePAT('\nvalidtoken1234567890ABCDEF\t')).toBe(true);
        });
    });

    describe('storeCredential and retrieveCredential', () => {
        it('should store and retrieve credentials', () => {
            const key = 'azure_pat';
            const credential = 'my-secret-pat-token';
            
            credentialManager.storeCredential(testSettings, key, credential);
            
            expect(testSettings[key]).toBeDefined();
            expect(testSettings[key].encrypted).toBe(true);
            expect(testSettings[key].value).toBeDefined();
            expect(testSettings[key].timestamp).toBeDefined();
            
            const retrieved = credentialManager.retrieveCredential(testSettings, key);
            expect(retrieved).toBe(credential);
        });

        it('should remove credential when storing empty value', () => {
            const key = 'azure_pat';
            testSettings[key] = { value: 'something' };
            
            credentialManager.storeCredential(testSettings, key, '');
            
            expect(testSettings[key]).toBeUndefined();
        });

        it('should return null for non-existent credentials', () => {
            const retrieved = credentialManager.retrieveCredential(testSettings, 'non_existent');
            expect(retrieved).toBeNull();
        });

        it('should handle corrupted stored credentials', () => {
            testSettings.corrupted = {
                encrypted: true,
                value: 'invalid-encrypted-data',
                timestamp: Date.now()
            };
            
            const retrieved = credentialManager.retrieveCredential(testSettings, 'corrupted');
            expect(retrieved).toBeNull();
            expect(mockLogger.error).toHaveBeenCalled();
        });
    });

    describe('isCredentialExpired', () => {
        it('should detect expired credentials', () => {
            const key = 'azure_pat';
            const oldTimestamp = Date.now() - (100 * 24 * 60 * 60 * 1000); // 100 days ago
            
            testSettings[key] = {
                encrypted: true,
                value: 'encrypted-value',
                timestamp: oldTimestamp
            };
            
            expect(credentialManager.isCredentialExpired(testSettings, key)).toBe(true);
        });

        it('should detect valid credentials', () => {
            const key = 'azure_pat';
            const recentTimestamp = Date.now() - (10 * 24 * 60 * 60 * 1000); // 10 days ago
            
            testSettings[key] = {
                encrypted: true,
                value: 'encrypted-value',
                timestamp: recentTimestamp
            };
            
            expect(credentialManager.isCredentialExpired(testSettings, key)).toBe(false);
        });

        it('should use custom max age', () => {
            const key = 'azure_pat';
            const timestamp = Date.now() - (2 * 60 * 60 * 1000); // 2 hours ago
            
            testSettings[key] = {
                encrypted: true,
                value: 'encrypted-value',
                timestamp: timestamp
            };
            
            // Should be expired with 1 hour max age
            expect(credentialManager.isCredentialExpired(testSettings, key, 60 * 60 * 1000)).toBe(true);
            
            // Should not be expired with 3 hour max age
            expect(credentialManager.isCredentialExpired(testSettings, key, 3 * 60 * 60 * 1000)).toBe(false);
        });

        it('should return true for non-existent credentials', () => {
            expect(credentialManager.isCredentialExpired(testSettings, 'non_existent')).toBe(true);
        });
    });

    describe('removeCredential', () => {
        it('should remove credentials from storage', () => {
            const key = 'azure_pat';
            testSettings[key] = { value: 'something' };
            
            credentialManager.removeCredential(testSettings, key);
            
            expect(testSettings[key]).toBeUndefined();
        });

        it('should handle removing non-existent credentials', () => {
            expect(() => {
                credentialManager.removeCredential(testSettings, 'non_existent');
            }).not.toThrow();
        });
    });

    describe('migrateCredential', () => {
        it('should migrate plain text credentials to encrypted', () => {
            const key = 'azure_pat';
            const plainCredential = 'plain-text-token';
            testSettings[key] = plainCredential;
            
            const migrated = credentialManager.migrateCredential(testSettings, key);
            
            expect(migrated).toBe(true);
            expect(testSettings[key].encrypted).toBe(true);
            expect(testSettings[key].value).toBeDefined();
            
            const retrieved = credentialManager.retrieveCredential(testSettings, key);
            expect(retrieved).toBe(plainCredential);
        });

        it('should not migrate already encrypted credentials', () => {
            const key = 'azure_pat';
            testSettings[key] = {
                encrypted: true,
                value: 'already-encrypted',
                timestamp: Date.now()
            };
            
            const migrated = credentialManager.migrateCredential(testSettings, key);
            
            expect(migrated).toBe(false);
        });

        it('should not migrate empty or invalid values', () => {
            testSettings.empty = '';
            testSettings.nullValue = null;
            testSettings.numberValue = 123;
            
            expect(credentialManager.migrateCredential(testSettings, 'empty')).toBe(false);
            expect(credentialManager.migrateCredential(testSettings, 'nullValue')).toBe(false);
            expect(credentialManager.migrateCredential(testSettings, 'numberValue')).toBe(false);
            expect(credentialManager.migrateCredential(testSettings, 'non_existent')).toBe(false);
        });
    });
});