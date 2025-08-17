/**
 * String utility functions for Stream Deck plugin
 */

/**
 * Truncates a string to specified length
 */
export function truncate(str: string, maxLength: number, suffix: string = '...'): string {
    if (!str || str.length <= maxLength) {
        return str;
    }
    return str.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * Capitalizes first letter of string
 */
export function capitalize(str: string): string {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Converts string to title case
 */
export function toTitleCase(str: string): string {
    if (!str) return str;
    return str.replace(/\w\S*/g, (txt) => {
        return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    });
}

/**
 * Removes leading and trailing whitespace
 */
export function trim(str: string): string {
    return str ? str.trim() : str;
}

/**
 * Checks if string is empty or whitespace
 */
export function isEmpty(str: string): boolean {
    return !str || str.trim().length === 0;
}

/**
 * Pads string to specified length
 */
export function padLeft(str: string, length: number, char: string = ' '): string {
    if (!str) str = '';
    while (str.length < length) {
        str = char + str;
    }
    return str;
}

/**
 * Pads string to specified length
 */
export function padRight(str: string, length: number, char: string = ' '): string {
    if (!str) str = '';
    while (str.length < length) {
        str = str + char;
    }
    return str;
}

/**
 * Replaces all occurrences of a substring
 */
export function replaceAll(str: string, search: string, replace: string): string {
    if (!str) return str;
    return str.split(search).join(replace);
}

/**
 * Counts occurrences of substring
 */
export function countOccurrences(str: string, substring: string): number {
    if (!str || !substring) return 0;
    return (str.match(new RegExp(substring, 'g')) || []).length;
}

/**
 * Reverses a string
 */
export function reverse(str: string): string {
    if (!str) return str;
    return str.split('').reverse().join('');
}

/**
 * Checks if string contains substring
 */
export function contains(str: string, substring: string, caseSensitive: boolean = true): boolean {
    if (!str || !substring) return false;
    if (!caseSensitive) {
        return str.toLowerCase().includes(substring.toLowerCase());
    }
    return str.includes(substring);
}

/**
 * Extracts numbers from string
 */
export function extractNumbers(str: string): number[] {
    if (!str) return [];
    const matches = str.match(/\d+/g);
    return matches ? matches.map(Number) : [];
}

/**
 * Removes HTML tags from string
 */
export function stripHtml(str: string): string {
    if (!str) return str;
    return str.replace(/<[^>]*>/g, '');
}

/**
 * Converts string to slug
 */
export function toSlug(str: string): string {
    if (!str) return str;
    return str
        .trim()
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * Checks if string is valid email
 */
export function isValidEmail(str: string): boolean {
    if (!str) return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(str);
}