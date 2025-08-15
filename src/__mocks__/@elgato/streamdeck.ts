/**
 * Mock for @elgato/streamdeck module
 * This mock provides a complete implementation for testing
 */

export class MockLogger {
    debug = jest.fn();
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
    trace = jest.fn();
}

export class MockAction {
    id: string;
    isKey = jest.fn().mockReturnValue(true);
    getSettings = jest.fn().mockResolvedValue({});
    setSettings = jest.fn().mockResolvedValue(undefined);
    setTitle = jest.fn().mockResolvedValue(undefined);
    setImage = jest.fn().mockResolvedValue(undefined);
    setState = jest.fn().mockResolvedValue(undefined);
    showOk = jest.fn().mockResolvedValue(undefined);
    showAlert = jest.fn().mockResolvedValue(undefined);
    sendToPropertyInspector = jest.fn();

    constructor(id: string = 'test-action') {
        this.id = id;
    }
}

const mockLogger = new MockLogger();

const mockStreamDeck = {
    logger: {
        createScope: jest.fn((name: string) => {
            const scopedLogger = new MockLogger();
            // Add scope name to each log method for debugging
            const originalDebug = scopedLogger.debug;
            scopedLogger.debug = jest.fn((...args) => {
                originalDebug(`[${name}]`, ...args);
            });
            return scopedLogger;
        }),
        debug: mockLogger.debug,
        info: mockLogger.info,
        warn: mockLogger.warn,
        error: mockLogger.error,
        trace: mockLogger.trace
    },
    system: {
        openUrl: jest.fn()
    },
    ui: {
        current: {
            sendToPropertyInspector: jest.fn()
        }
    },
    actions: {
        getActionById: jest.fn((id: string) => new MockAction(id))
    },
    devices: {
        getDeviceById: jest.fn()
    },
    settings: {
        getGlobalSettings: jest.fn().mockResolvedValue({}),
        setGlobalSettings: jest.fn().mockResolvedValue(undefined)
    }
};

// Export classes and decorators
export const action = jest.fn(() => (target: any) => target);

export class SingletonAction<T = any> {
    constructor() {}
    onWillAppear(ev: any): void | Promise<void> {}
    onWillDisappear(ev: any): void | Promise<void> {}
    onKeyDown(ev: any): void | Promise<void> {}
    onKeyUp(ev: any): void | Promise<void> {}
    onDialRotate(ev: any): void | Promise<void> {}
    onDidReceiveSettings(ev: any): void | Promise<void> {}
    onSendToPlugin(ev: any): void | Promise<void> {}
    onPropertyInspectorDidAppear(ev: any): void | Promise<void> {}
    onPropertyInspectorDidDisappear(ev: any): void | Promise<void> {}
}

export class Action<T = any> {
    id: string = 'test-action';
    isKey(): boolean { return true; }
    async getSettings(): Promise<T> { return {} as T; }
    async setSettings(settings: T): Promise<void> {}
    async setTitle(title: string): Promise<void> {}
    async setImage(image: string): Promise<void> {}
    async setState(state: number): Promise<void> {}
    async showOk(): Promise<void> {}
    async showAlert(): Promise<void> {}
}

export type KeyAction<T = any> = Action<T> & {
    isKey(): boolean;
};

// Event classes
export class WillAppearEvent<T = any> {
    action: KeyAction<T>;
    payload: { settings: T };
    constructor(action: KeyAction<T>, settings: T) {
        this.action = action;
        this.payload = { settings };
    }
}

export class WillDisappearEvent<T = any> {
    action: KeyAction<T>;
    payload: { settings: T };
    constructor(action: KeyAction<T>, settings: T) {
        this.action = action;
        this.payload = { settings };
    }
}

export class KeyDownEvent<T = any> {
    action: KeyAction<T>;
    payload: { settings: T };
    constructor(action: KeyAction<T>, settings: T) {
        this.action = action;
        this.payload = { settings };
    }
}

export class DidReceiveSettingsEvent<T = any> {
    action: KeyAction<T>;
    payload: { settings: T };
    constructor(action: KeyAction<T>, settings: T) {
        this.action = action;
        this.payload = { settings };
    }
}

export class SendToPluginEvent<P = any, S = any> {
    action: KeyAction<S>;
    payload: P;
    constructor(action: KeyAction<S>, payload: P) {
        this.action = action;
        this.payload = payload;
    }
}

export type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
export interface JsonObject { [key: string]: JsonValue; }
export interface JsonArray extends Array<JsonValue> {}

// Export default
export default mockStreamDeck;

// Export streamDeck as named export too
export const streamDeck = mockStreamDeck;