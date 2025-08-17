/**
 * Validation utility functions
 */

/**
 * Validates if value is a number
 */
export function isNumber(value: any): boolean {
    return typeof value === 'number' && !isNaN(value);
}

/**
 * Validates if value is a string
 */
export function isString(value: any): boolean {
    return typeof value === 'string';
}

/**
 * Validates if value is a boolean
 */
export function isBoolean(value: any): boolean {
    return typeof value === 'boolean';
}

/**
 * Validates if value is an object
 */
export function isObject(value: any): boolean {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Validates if value is an array
 */
export function isArray(value: any): boolean {
    return Array.isArray(value);
}

/**
 * Validates if value is null or undefined
 */
export function isNullOrUndefined(value: any): boolean {
    return value === null || value === undefined;
}

/**
 * Validates if value is a function
 */
export function isFunction(value: any): boolean {
    return typeof value === 'function';
}

/**
 * Validates if value is a valid URL
 */
export function isValidUrl(value: string): boolean {
    try {
        new URL(value);
        return true;
    } catch {
        return false;
    }
}

/**
 * Validates if value is within range
 */
export function isInRange(value: number, min: number, max: number): boolean {
    return isNumber(value) && value >= min && value <= max;
}

/**
 * Validates if string matches pattern
 */
export function matchesPattern(value: string, pattern: RegExp): boolean {
    return isString(value) && pattern.test(value);
}

/**
 * Validates if object has required properties
 */
export function hasRequiredProps(obj: any, props: string[]): boolean {
    if (!isObject(obj)) return false;
    return props.every(prop => prop in obj);
}

/**
 * Validates if value is a positive number
 */
export function isPositiveNumber(value: any): boolean {
    return isNumber(value) && value > 0;
}

/**
 * Validates if value is a non-empty string
 */
export function isNonEmptyString(value: any): boolean {
    return isString(value) && value.trim().length > 0;
}

/**
 * Validates if value is a valid enum value
 */
export function isValidEnumValue<T>(value: any, enumObj: T): boolean {
    return Object.values(enumObj as any).includes(value);
}

/**
 * Validates if all values in array pass test
 */
export function allValid<T>(arr: T[], validator: (item: T) => boolean): boolean {
    return isArray(arr) && arr.every(validator);
}