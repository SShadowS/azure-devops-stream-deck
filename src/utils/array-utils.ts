/**
 * Array utility functions
 */

/**
 * Removes duplicates from array
 */
export function unique<T>(arr: T[]): T[] {
    return [...new Set(arr)];
}

/**
 * Chunks array into smaller arrays
 */
export function chunk<T>(arr: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
        result.push(arr.slice(i, i + size));
    }
    return result;
}

/**
 * Flattens nested array
 */
export function flatten<T>(arr: any[]): T[] {
    return arr.reduce((flat, item) => {
        return flat.concat(Array.isArray(item) ? flatten(item) : item);
    }, []);
}

/**
 * Shuffles array
 */
export function shuffle<T>(arr: T[]): T[] {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

/**
 * Gets random element from array
 */
export function sample<T>(arr: T[]): T | undefined {
    if (arr.length === 0) return undefined;
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Groups array by key
 */
export function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
    return arr.reduce((groups, item) => {
        const group = String(item[key]);
        groups[group] = groups[group] || [];
        groups[group].push(item);
        return groups;
    }, {} as Record<string, T[]>);
}

/**
 * Finds intersection of two arrays
 */
export function intersection<T>(arr1: T[], arr2: T[]): T[] {
    const set2 = new Set(arr2);
    return arr1.filter(x => set2.has(x));
}

/**
 * Finds difference between two arrays
 */
export function difference<T>(arr1: T[], arr2: T[]): T[] {
    const set2 = new Set(arr2);
    return arr1.filter(x => !set2.has(x));
}

/**
 * Partitions array based on predicate
 */
export function partition<T>(arr: T[], predicate: (item: T) => boolean): [T[], T[]] {
    const pass: T[] = [];
    const fail: T[] = [];
    
    arr.forEach(item => {
        if (predicate(item)) {
            pass.push(item);
        } else {
            fail.push(item);
        }
    });
    
    return [pass, fail];
}

/**
 * Counts occurrences of items
 */
export function countBy<T>(arr: T[]): Map<T, number> {
    const counts = new Map<T, number>();
    arr.forEach(item => {
        counts.set(item, (counts.get(item) || 0) + 1);
    });
    return counts;
}