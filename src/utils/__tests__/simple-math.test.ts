import {
    add,
    subtract,
    multiply,
    divide,
    percentage,
    roundTo,
    clamp,
    inRange,
    average,
    max,
    min,
    sum
} from '../simple-math';

describe('Simple Math Utilities', () => {
    describe('add', () => {
        it('should add two positive numbers', () => {
            expect(add(2, 3)).toBe(5);
            expect(add(10, 20)).toBe(30);
        });

        it('should add negative numbers', () => {
            expect(add(-2, -3)).toBe(-5);
            expect(add(-10, 5)).toBe(-5);
        });

        it('should add decimals', () => {
            expect(add(0.1, 0.2)).toBeCloseTo(0.3);
            expect(add(1.5, 2.5)).toBe(4);
        });
    });

    describe('subtract', () => {
        it('should subtract two numbers', () => {
            expect(subtract(5, 3)).toBe(2);
            expect(subtract(10, 20)).toBe(-10);
        });

        it('should handle negative numbers', () => {
            expect(subtract(-5, -3)).toBe(-2);
            expect(subtract(-5, 3)).toBe(-8);
        });
    });

    describe('multiply', () => {
        it('should multiply two numbers', () => {
            expect(multiply(3, 4)).toBe(12);
            expect(multiply(5, 0)).toBe(0);
        });

        it('should handle negative numbers', () => {
            expect(multiply(-3, 4)).toBe(-12);
            expect(multiply(-3, -4)).toBe(12);
        });
    });

    describe('divide', () => {
        it('should divide two numbers', () => {
            expect(divide(10, 2)).toBe(5);
            expect(divide(15, 3)).toBe(5);
        });

        it('should handle decimals', () => {
            expect(divide(1, 3)).toBeCloseTo(0.333, 2);
            expect(divide(10, 4)).toBe(2.5);
        });

        it('should throw error for division by zero', () => {
            expect(() => divide(10, 0)).toThrow('Division by zero');
            expect(() => divide(0, 0)).toThrow('Division by zero');
        });
    });

    describe('percentage', () => {
        it('should calculate percentage', () => {
            expect(percentage(50, 100)).toBe(50);
            expect(percentage(25, 200)).toBe(12.5);
            expect(percentage(75, 150)).toBe(50);
        });

        it('should return 0 when total is 0', () => {
            expect(percentage(10, 0)).toBe(0);
            expect(percentage(0, 0)).toBe(0);
        });
    });

    describe('roundTo', () => {
        it('should round to specified decimal places', () => {
            expect(roundTo(3.14159, 2)).toBe(3.14);
            expect(roundTo(3.14159, 3)).toBe(3.142);
            expect(roundTo(3.14159, 0)).toBe(3);
        });

        it('should handle negative numbers', () => {
            expect(roundTo(-3.14159, 2)).toBe(-3.14);
            expect(roundTo(-10.567, 1)).toBe(-10.6);
        });
    });

    describe('clamp', () => {
        it('should clamp value within range', () => {
            expect(clamp(5, 0, 10)).toBe(5);
            expect(clamp(-5, 0, 10)).toBe(0);
            expect(clamp(15, 0, 10)).toBe(10);
        });

        it('should handle edge cases', () => {
            expect(clamp(0, 0, 10)).toBe(0);
            expect(clamp(10, 0, 10)).toBe(10);
        });
    });

    describe('inRange', () => {
        it('should check if value is in range', () => {
            expect(inRange(5, 0, 10)).toBe(true);
            expect(inRange(0, 0, 10)).toBe(true);
            expect(inRange(10, 0, 10)).toBe(true);
        });

        it('should return false for out of range values', () => {
            expect(inRange(-1, 0, 10)).toBe(false);
            expect(inRange(11, 0, 10)).toBe(false);
        });
    });

    describe('average', () => {
        it('should calculate average of array', () => {
            expect(average([1, 2, 3, 4, 5])).toBe(3);
            expect(average([10, 20, 30])).toBe(20);
            expect(average([5])).toBe(5);
        });

        it('should return 0 for empty array', () => {
            expect(average([])).toBe(0);
        });

        it('should handle negative numbers', () => {
            expect(average([-10, 0, 10])).toBe(0);
            expect(average([-5, -10, -15])).toBe(-10);
        });
    });

    describe('max', () => {
        it('should find maximum value', () => {
            expect(max([1, 5, 3, 9, 2])).toBe(9);
            expect(max([10])).toBe(10);
            expect(max([-5, -2, -10])).toBe(-2);
        });

        it('should return -Infinity for empty array', () => {
            expect(max([])).toBe(-Infinity);
        });
    });

    describe('min', () => {
        it('should find minimum value', () => {
            expect(min([1, 5, 3, 9, 2])).toBe(1);
            expect(min([10])).toBe(10);
            expect(min([-5, -2, -10])).toBe(-10);
        });

        it('should return Infinity for empty array', () => {
            expect(min([])).toBe(Infinity);
        });
    });

    describe('sum', () => {
        it('should calculate sum of array', () => {
            expect(sum([1, 2, 3, 4, 5])).toBe(15);
            expect(sum([10, 20, 30])).toBe(60);
            expect(sum([5])).toBe(5);
        });

        it('should return 0 for empty array', () => {
            expect(sum([])).toBe(0);
        });

        it('should handle negative numbers', () => {
            expect(sum([-10, 10])).toBe(0);
            expect(sum([-5, -10, -15])).toBe(-30);
        });
    });
});