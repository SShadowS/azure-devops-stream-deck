import {
    formatDate,
    formatTime,
    daysBetween,
    addDays,
    isToday,
    isPast,
    isFuture,
    getRelativeTime
} from '../date-utils';

describe('Date Utilities', () => {
    describe('formatDate', () => {
        it('should format date as YYYY-MM-DD', () => {
            expect(formatDate(new Date('2024-01-15'))).toBe('2024-01-15');
            expect(formatDate(new Date('2024-12-31'))).toBe('2024-12-31');
        });

        it('should pad single digit months and days', () => {
            expect(formatDate(new Date('2024-01-01'))).toBe('2024-01-01');
            expect(formatDate(new Date('2024-09-05'))).toBe('2024-09-05');
        });
    });

    describe('formatTime', () => {
        it('should format time as HH:MM:SS', () => {
            const date = new Date('2024-01-15T14:30:45');
            expect(formatTime(date)).toBe('14:30:45');
        });

        it('should pad single digits', () => {
            const date = new Date('2024-01-15T09:05:03');
            expect(formatTime(date)).toBe('09:05:03');
        });
    });

    describe('daysBetween', () => {
        it('should calculate days between dates', () => {
            const date1 = new Date('2024-01-01');
            const date2 = new Date('2024-01-10');
            expect(daysBetween(date1, date2)).toBe(9);
        });

        it('should return same result regardless of order', () => {
            const date1 = new Date('2024-01-01');
            const date2 = new Date('2024-01-10');
            expect(daysBetween(date2, date1)).toBe(9);
        });

        it('should return 0 for same date', () => {
            const date = new Date('2024-01-01');
            expect(daysBetween(date, date)).toBe(0);
        });
    });

    describe('addDays', () => {
        it('should add positive days', () => {
            const date = new Date('2024-01-15');
            const result = addDays(date, 5);
            expect(formatDate(result)).toBe('2024-01-20');
        });

        it('should subtract negative days', () => {
            const date = new Date('2024-01-15');
            const result = addDays(date, -5);
            expect(formatDate(result)).toBe('2024-01-10');
        });

        it('should not modify original date', () => {
            const date = new Date('2024-01-15');
            const original = new Date(date);
            addDays(date, 5);
            expect(date.getTime()).toBe(original.getTime());
        });
    });

    describe('isToday', () => {
        it('should return true for today', () => {
            const today = new Date();
            expect(isToday(today)).toBe(true);
        });

        it('should return false for yesterday', () => {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            expect(isToday(yesterday)).toBe(false);
        });

        it('should return false for tomorrow', () => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            expect(isToday(tomorrow)).toBe(false);
        });
    });

    describe('isPast', () => {
        it('should return true for past dates', () => {
            const past = new Date('2020-01-01');
            expect(isPast(past)).toBe(true);
        });

        it('should return false for future dates', () => {
            const future = new Date('2030-01-01');
            expect(isPast(future)).toBe(false);
        });
    });

    describe('isFuture', () => {
        it('should return true for future dates', () => {
            const future = new Date('2030-01-01');
            expect(isFuture(future)).toBe(true);
        });

        it('should return false for past dates', () => {
            const past = new Date('2020-01-01');
            expect(isFuture(past)).toBe(false);
        });
    });

    describe('getRelativeTime', () => {
        beforeEach(() => {
            jest.useFakeTimers();
            jest.setSystemTime(new Date('2024-01-15T12:00:00'));
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('should return seconds ago for recent times', () => {
            const date = new Date('2024-01-15T11:59:30');
            expect(getRelativeTime(date)).toBe('30 seconds ago');
        });

        it('should return minutes ago for times within hour', () => {
            const date = new Date('2024-01-15T11:30:00');
            expect(getRelativeTime(date)).toBe('30 minutes ago');
        });

        it('should return hours ago for times within day', () => {
            const date = new Date('2024-01-15T06:00:00');
            expect(getRelativeTime(date)).toBe('6 hours ago');
        });

        it('should return days ago for older times', () => {
            const date = new Date('2024-01-10T12:00:00');
            expect(getRelativeTime(date)).toBe('5 days ago');
        });
    });
});