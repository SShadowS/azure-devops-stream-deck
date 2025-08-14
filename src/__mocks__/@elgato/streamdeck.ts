// Mock for @elgato/streamdeck module
export const LogLevel = {
    TRACE: 0,
    DEBUG: 1,
    INFO: 2,
    WARN: 3,
    ERROR: 4
};

export class Logger {
    trace = jest.fn();
    debug = jest.fn();
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
}

export class SingletonAction {
    onWillAppear = jest.fn();
    onWillDisappear = jest.fn();
    onKeyDown = jest.fn();
    onKeyUp = jest.fn();
    onDidReceiveSettings = jest.fn();
    onPropertyInspectorDidAppear = jest.fn();
    onPropertyInspectorDidDisappear = jest.fn();
    onSendToPlugin = jest.fn();
    setTitle = jest.fn();
    setImage = jest.fn();
    setState = jest.fn();
    showAlert = jest.fn();
    showOk = jest.fn();
    setSettings = jest.fn();
    getSettings = jest.fn();
    openUrl = jest.fn();
    sendToPropertyInspector = jest.fn();
}

export const action = (uuid: string) => {
    return (target: any) => {
        target.UUID = uuid;
        return target;
    };
};

export const streamDeck = {
    logger: new Logger(),
    actions: {
        registerAction: jest.fn()
    },
    connect: jest.fn(),
    devices: {
        getDeviceArtworkSize: jest.fn().mockReturnValue({ width: 72, height: 72 })
    },
    settings: {
        getGlobalSettings: jest.fn().mockResolvedValue({}),
        setGlobalSettings: jest.fn().mockResolvedValue(undefined)
    },
    system: {
        openUrl: jest.fn()
    },
    ui: {
        showAlert: jest.fn(),
        showOk: jest.fn()
    }
};

export default streamDeck;