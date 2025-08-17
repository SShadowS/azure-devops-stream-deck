/**
 * Object utility functions
 */

/**
 * Deep clones an object
 */
export function deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    
    if (obj instanceof Date) {
        return new Date(obj.getTime()) as any;
    }
    
    if (obj instanceof Array) {
        return obj.map(item => deepClone(item)) as any;
    }
    
    if (obj instanceof Object) {
        const cloned = {} as T;
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                cloned[key] = deepClone(obj[key]);
            }
        }
        return cloned;
    }
    
    return obj;
}

/**
 * Deep merges two objects
 */
export function deepMerge<T>(target: T, source: any): T {
    const result = { ...target };
    
    for (const key in source) {
        if (source.hasOwnProperty(key)) {
            const sourceValue = source[key];
            const targetValue = (result as any)[key];
            
            if (isObject(sourceValue) && isObject(targetValue)) {
                (result as any)[key] = deepMerge(targetValue, sourceValue);
            } else {
                (result as any)[key] = sourceValue;
            }
        }
    }
    
    return result;
}

/**
 * Checks if value is a plain object
 */
export function isObject(value: any): value is Record<string, any> {
    return value !== null && 
           typeof value === 'object' && 
           value.constructor === Object;
}

/**
 * Picks specified keys from object
 */
export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
    const result = {} as Pick<T, K>;
    
    for (const key of keys) {
        if (key in obj) {
            result[key] = obj[key];
        }
    }
    
    return result;
}

/**
 * Omits specified keys from object
 */
export function omit<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
    const result = { ...obj } as any;
    
    for (const key of keys) {
        delete result[key];
    }
    
    return result;
}

/**
 * Gets nested property value safely
 */
export function get(obj: any, path: string, defaultValue?: any): any {
    const keys = path.split('.');
    let result = obj;
    
    for (const key of keys) {
        if (result === null || result === undefined) {
            return defaultValue;
        }
        result = result[key];
    }
    
    return result === undefined ? defaultValue : result;
}

/**
 * Sets nested property value
 */
export function set(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    const lastKey = keys.pop();
    
    if (!lastKey) return;
    
    let current = obj;
    
    for (const key of keys) {
        if (!(key in current) || !isObject(current[key])) {
            current[key] = {};
        }
        current = current[key];
    }
    
    current[lastKey] = value;
}

/**
 * Checks if objects are deeply equal
 */
export function isEqual(a: any, b: any): boolean {
    if (a === b) return true;
    
    if (a === null || b === null) return false;
    if (a === undefined || b === undefined) return false;
    
    if (typeof a !== typeof b) return false;
    
    if (typeof a !== 'object') return a === b;
    
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        return a.every((item, index) => isEqual(item, b[index]));
    }
    
    if (Array.isArray(a) || Array.isArray(b)) return false;
    
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    
    if (keysA.length !== keysB.length) return false;
    
    return keysA.every(key => isEqual(a[key], b[key]));
}

/**
 * Maps object values
 */
export function mapValues<T, R>(
    obj: Record<string, T>, 
    fn: (value: T, key: string) => R
): Record<string, R> {
    const result: Record<string, R> = {};
    
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            result[key] = fn(obj[key], key);
        }
    }
    
    return result;
}

/**
 * Filters object by predicate
 */
export function filterObject<T>(
    obj: Record<string, T>,
    predicate: (value: T, key: string) => boolean
): Record<string, T> {
    const result: Record<string, T> = {};
    
    for (const key in obj) {
        if (obj.hasOwnProperty(key) && predicate(obj[key], key)) {
            result[key] = obj[key];
        }
    }
    
    return result;
}

/**
 * Checks if object is empty
 */
export function isEmpty(obj: any): boolean {
    if (obj === null || obj === undefined) return true;
    
    if (typeof obj === 'object') {
        return Object.keys(obj).length === 0;
    }
    
    return false;
}

/**
 * Inverts object keys and values
 */
export function invert<T extends Record<string, string>>(obj: T): Record<string, keyof T> {
    const result: Record<string, keyof T> = {};
    
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            result[obj[key]] = key;
        }
    }
    
    return result;
}