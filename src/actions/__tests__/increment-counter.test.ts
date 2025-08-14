import { IncrementCounter } from '../increment-counter';
import { WillAppearEvent, KeyDownEvent } from '@elgato/streamdeck';

jest.mock('@elgato/streamdeck', () => ({
    action: jest.fn((config) => (target: any) => target),
    SingletonAction: class {
        constructor() {}
    }
}));

describe('IncrementCounter', () => {
    let counter: IncrementCounter;

    beforeEach(() => {
        jest.clearAllMocks();
        counter = new IncrementCounter();
    });

    describe('onWillAppear', () => {
        it('should set title to 0 when count is undefined', async () => {
            const event = {
                action: {
                    setTitle: jest.fn()
                },
                payload: {
                    settings: {}
                }
            } as any as WillAppearEvent<any>;

            await counter.onWillAppear(event);

            expect(event.action.setTitle).toHaveBeenCalledWith('0');
        });

        it('should set title to current count', async () => {
            const event = {
                action: {
                    setTitle: jest.fn()
                },
                payload: {
                    settings: {
                        count: 42
                    }
                }
            } as any as WillAppearEvent<any>;

            await counter.onWillAppear(event);

            expect(event.action.setTitle).toHaveBeenCalledWith('42');
        });

        it('should handle negative counts', async () => {
            const event = {
                action: {
                    setTitle: jest.fn()
                },
                payload: {
                    settings: {
                        count: -5
                    }
                }
            } as any as WillAppearEvent<any>;

            await counter.onWillAppear(event);

            expect(event.action.setTitle).toHaveBeenCalledWith('-5');
        });
    });

    describe('onKeyDown', () => {
        it('should increment count by 1 when incrementBy is not set', async () => {
            const event = {
                action: {
                    setSettings: jest.fn(),
                    setTitle: jest.fn()
                },
                payload: {
                    settings: {
                        count: 5
                    }
                }
            } as any as KeyDownEvent<any>;

            await counter.onKeyDown(event);

            expect(event.action.setSettings).toHaveBeenCalledWith({
                count: 6,
                incrementBy: 1
            });
            expect(event.action.setTitle).toHaveBeenCalledWith('6');
        });

        it('should increment count by custom incrementBy value', async () => {
            const event = {
                action: {
                    setSettings: jest.fn(),
                    setTitle: jest.fn()
                },
                payload: {
                    settings: {
                        count: 10,
                        incrementBy: 5
                    }
                }
            } as any as KeyDownEvent<any>;

            await counter.onKeyDown(event);

            expect(event.action.setSettings).toHaveBeenCalledWith({
                count: 15,
                incrementBy: 5
            });
            expect(event.action.setTitle).toHaveBeenCalledWith('15');
        });

        it('should start from 0 when count is undefined', async () => {
            const event = {
                action: {
                    setSettings: jest.fn(),
                    setTitle: jest.fn()
                },
                payload: {
                    settings: {}
                }
            } as any as KeyDownEvent<any>;

            await counter.onKeyDown(event);

            expect(event.action.setSettings).toHaveBeenCalledWith({
                count: 1,
                incrementBy: 1
            });
            expect(event.action.setTitle).toHaveBeenCalledWith('1');
        });

        it('should handle negative incrementBy', async () => {
            const event = {
                action: {
                    setSettings: jest.fn(),
                    setTitle: jest.fn()
                },
                payload: {
                    settings: {
                        count: 10,
                        incrementBy: -3
                    }
                }
            } as any as KeyDownEvent<any>;

            await counter.onKeyDown(event);

            expect(event.action.setSettings).toHaveBeenCalledWith({
                count: 7,
                incrementBy: -3
            });
            expect(event.action.setTitle).toHaveBeenCalledWith('7');
        });

        it('should handle both undefined count and incrementBy', async () => {
            const event = {
                action: {
                    setSettings: jest.fn(),
                    setTitle: jest.fn()
                },
                payload: {
                    settings: {}
                }
            } as any as KeyDownEvent<any>;

            await counter.onKeyDown(event);

            expect(event.action.setSettings).toHaveBeenCalledWith({
                count: 1,
                incrementBy: 1
            });
            expect(event.action.setTitle).toHaveBeenCalledWith('1');
        });

        it('should maintain incrementBy across multiple presses', async () => {
            const event = {
                action: {
                    setSettings: jest.fn(),
                    setTitle: jest.fn()
                },
                payload: {
                    settings: {
                        count: 0,
                        incrementBy: 10
                    }
                }
            } as any as KeyDownEvent<any>;

            // First press
            await counter.onKeyDown(event);
            expect(event.action.setSettings).toHaveBeenCalledWith({
                count: 10,
                incrementBy: 10
            });

            // Update event settings for second press
            event.payload.settings = {
                count: 10,
                incrementBy: 10
            };

            // Second press
            await counter.onKeyDown(event);
            expect(event.action.setSettings).toHaveBeenCalledWith({
                count: 20,
                incrementBy: 10
            });
        });
    });
});