/**
 * Simple math utilities for Stream Deck plugin
 */

/**
 * Adds two numbers
 */
export function add(a: number, b: number): number {
    return a + b;
}

/**
 * Subtracts two numbers
 */
export function subtract(a: number, b: number): number {
    return a - b;
}

/**
 * Multiplies two numbers
 */
export function multiply(a: number, b: number): number {
    return a * b;
}

/**
 * Divides two numbers
 */
export function divide(a: number, b: number): number {
    if (b === 0) {
        throw new Error('Division by zero');
    }
    return a / b;
}

/**
 * Calculates percentage
 */
export function percentage(value: number, total: number): number {
    if (total === 0) {
        return 0;
    }
    return (value / total) * 100;
}

/**
 * Rounds to specified decimal places
 */
export function roundTo(value: number, decimals: number): number {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
}

/**
 * Clamps a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

/**
 * Checks if a number is within range
 */
export function inRange(value: number, min: number, max: number): boolean {
    return value >= min && value <= max;
}

/**
 * Calculates average of an array
 */
export function average(numbers: number[]): number {
    if (numbers.length === 0) {
        return 0;
    }
    const sum = numbers.reduce((acc, num) => acc + num, 0);
    return sum / numbers.length;
}

/**
 * Finds the maximum value in an array
 */
export function max(numbers: number[]): number {
    if (numbers.length === 0) {
        return -Infinity;
    }
    return Math.max(...numbers);
}

/**
 * Finds the minimum value in an array
 */
export function min(numbers: number[]): number {
    if (numbers.length === 0) {
        return Infinity;
    }
    return Math.min(...numbers);
}

/**
 * Calculates the sum of an array
 */
export function sum(numbers: number[]): number {
    return numbers.reduce((acc, num) => acc + num, 0);
}