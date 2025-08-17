import { ActionState } from '../utils/action-state-manager';

/**
 * Creates a properly typed mock state that satisfies ActionState interface
 */
export function createMockActionState(overrides: Partial<ActionState> = {}): ActionState {
    return {
        connectionAttempts: 0,
        lastUpdate: undefined,
        lastError: undefined,
        isConnecting: false,
        lastStatus: undefined,
        pollingInterval: undefined,
        rotationIndex: 0,
        lastSettings: {},
        ...overrides
    };
}

/**
 * Creates a mock Stream Deck action object
 */
export function createMockAction(id: string = 'test-action-id') {
    return {
        id,
        setTitle: jest.fn(),
        setImage: jest.fn(),
        setState: jest.fn(),
        showAlert: jest.fn(),
        showOk: jest.fn(),
        getSettings: jest.fn(),
        setSettings: jest.fn()
    };
}

/**
 * Creates a mock event for Stream Deck actions
 */
export function createMockEvent(eventType: string, payload: any = {}) {
    const mockAction = createMockAction();
    return {
        action: mockAction,
        payload
    };
}

/**
 * Mock Stream Deck module setup
 */
export const mockStreamDeckModule = () => {
    const mockLogger: any = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        trace: jest.fn(),
        createScope: jest.fn((): any => mockLogger)
    };
    
    const mockStreamDeck = {
        logger: mockLogger,
        system: {
            openUrl: jest.fn()
        },
        ui: {
            current: {
                sendToPropertyInspector: jest.fn()
            }
        },
        actions: {
            getActionById: jest.fn()
        }
    };
    
    return {
        __esModule: true,
        default: mockStreamDeck,
        streamDeck: mockStreamDeck,
        action: jest.fn(() => (target: any) => target),
        SingletonAction: class {
            constructor() {}
            onWillAppear(ev: any): void | Promise<void> {}
            onWillDisappear(ev: any): void | Promise<void> {}
            onKeyDown(ev: any): void | Promise<void> {}
            onDidReceiveSettings(ev: any): void | Promise<void> {}
            onSendToPlugin(ev: any): void | Promise<void> {}
        },
        WillAppearEvent: class {},
        KeyDownEvent: class {},
        DidReceiveSettingsEvent: class {},
        WillDisappearEvent: class {},
        SendToPluginEvent: class {}
    };
};