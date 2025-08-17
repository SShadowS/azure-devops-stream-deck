import {
    deepClone,
    deepMerge,
    isObject,
    pick,
    omit,
    get,
    set,
    isEqual,
    mapValues,
    filterObject,
    isEmpty,
    invert
} from '../object-utils';

describe('Object Utilities', () => {
    describe('deepClone', () => {
        it('should clone primitives', () => {
            expect(deepClone(42)).toBe(42);
            expect(deepClone('hello')).toBe('hello');
            expect(deepClone(true)).toBe(true);
            expect(deepClone(null)).toBe(null);
            expect(deepClone(undefined)).toBe(undefined);
        });

        it('should clone objects', () => {
            const obj = { a: 1, b: { c: 2 } };
            const cloned = deepClone(obj);
            
            expect(cloned).toEqual(obj);
            expect(cloned).not.toBe(obj);
            expect(cloned.b).not.toBe(obj.b);
        });

        it('should clone arrays', () => {
            const arr = [1, [2, 3], { a: 4 }];
            const cloned = deepClone(arr);
            
            expect(cloned).toEqual(arr);
            expect(cloned).not.toBe(arr);
            expect(cloned[1]).not.toBe(arr[1]);
            expect(cloned[2]).not.toBe(arr[2]);
        });

        it('should clone dates', () => {
            const date = new Date('2024-01-15');
            const cloned = deepClone(date);
            
            expect(cloned).toEqual(date);
            expect(cloned).not.toBe(date);
            expect(cloned instanceof Date).toBe(true);
        });

        it('should handle nested structures', () => {
            const obj = {
                a: 1,
                b: {
                    c: [1, 2, { d: 3 }],
                    e: new Date('2024-01-15')
                }
            };
            const cloned = deepClone(obj);
            
            expect(cloned).toEqual(obj);
            expect(cloned.b.c[2]).not.toBe(obj.b.c[2]);
        });
    });

    describe('deepMerge', () => {
        it('should merge flat objects', () => {
            const target = { a: 1, b: 2 };
            const source = { b: 3, c: 4 };
            const result = deepMerge(target, source as any);
            
            expect(result).toEqual({ a: 1, b: 3, c: 4 });
        });

        it('should merge nested objects', () => {
            const target = { a: { b: 1, c: 2 } };
            const source = { a: { c: 3, d: 4 } };
            const result = deepMerge(target, source as any);
            
            expect(result).toEqual({ a: { b: 1, c: 3, d: 4 } });
        });

        it('should overwrite non-object values', () => {
            const target = { a: { b: 1 }, c: 'old' };
            const source = { a: 'new', c: { d: 2 } };
            const result = deepMerge(target, source as any);
            
            expect(result).toEqual({ a: 'new', c: { d: 2 } });
        });

        it('should not modify original objects', () => {
            const target = { a: 1 };
            const source = { b: 2 };
            const original = { ...target };
            
            deepMerge(target, source as any);
            expect(target).toEqual(original);
        });
    });

    describe('isObject', () => {
        it('should return true for plain objects', () => {
            expect(isObject({})).toBe(true);
            expect(isObject({ a: 1 })).toBe(true);
            expect(isObject(new Object())).toBe(true);
        });

        it('should return false for non-objects', () => {
            expect(isObject(null)).toBe(false);
            expect(isObject(undefined)).toBe(false);
            expect(isObject([])).toBe(false);
            expect(isObject(new Date())).toBe(false);
            expect(isObject(() => {})).toBe(false);
            expect(isObject('object')).toBe(false);
            expect(isObject(42)).toBe(false);
        });
    });

    describe('pick', () => {
        it('should pick specified keys', () => {
            const obj = { a: 1, b: 2, c: 3, d: 4 };
            expect(pick(obj, ['a', 'c'])).toEqual({ a: 1, c: 3 });
        });

        it('should ignore non-existent keys', () => {
            const obj = { a: 1, b: 2 };
            expect(pick(obj, ['a', 'c' as keyof typeof obj])).toEqual({ a: 1 });
        });

        it('should handle empty keys array', () => {
            const obj = { a: 1, b: 2 };
            expect(pick(obj, [])).toEqual({});
        });
    });

    describe('omit', () => {
        it('should omit specified keys', () => {
            const obj = { a: 1, b: 2, c: 3, d: 4 };
            expect(omit(obj, ['b', 'd'])).toEqual({ a: 1, c: 3 });
        });

        it('should ignore non-existent keys', () => {
            const obj = { a: 1, b: 2 };
            expect(omit(obj, ['c' as keyof typeof obj])).toEqual({ a: 1, b: 2 });
        });

        it('should handle empty keys array', () => {
            const obj = { a: 1, b: 2 };
            expect(omit(obj, [])).toEqual({ a: 1, b: 2 });
        });
    });

    describe('get', () => {
        it('should get nested values', () => {
            const obj = { a: { b: { c: 42 } } };
            expect(get(obj, 'a.b.c')).toBe(42);
        });

        it('should return defaultValue for missing paths', () => {
            const obj = { a: { b: 1 } };
            expect(get(obj, 'a.c.d', 'default')).toBe('default');
        });

        it('should handle null/undefined in path', () => {
            const obj = { a: null };
            expect(get(obj, 'a.b.c', 'default')).toBe('default');
        });

        it('should return undefined without defaultValue', () => {
            const obj = { a: 1 };
            expect(get(obj, 'b')).toBeUndefined();
        });

        it('should handle array indices', () => {
            const obj = { a: [1, 2, 3] };
            expect(get(obj, 'a.1')).toBe(2);
        });
    });

    describe('set', () => {
        it('should set nested values', () => {
            const obj: any = {};
            set(obj, 'a.b.c', 42);
            expect(obj.a.b.c).toBe(42);
        });

        it('should overwrite existing values', () => {
            const obj = { a: { b: { c: 1 } } };
            set(obj, 'a.b.c', 42);
            expect(obj.a.b.c).toBe(42);
        });

        it('should create missing objects', () => {
            const obj: any = { a: 1 };
            set(obj, 'b.c.d', 42);
            expect(obj.b.c.d).toBe(42);
        });

        it('should handle empty path', () => {
            const obj = { a: 1 };
            set(obj, '', 42);
            expect(obj).toEqual({ a: 1 });
        });
    });

    describe('isEqual', () => {
        it('should compare primitives', () => {
            expect(isEqual(42, 42)).toBe(true);
            expect(isEqual('hello', 'hello')).toBe(true);
            expect(isEqual(true, true)).toBe(true);
            expect(isEqual(null, null)).toBe(true);
            expect(isEqual(undefined, undefined)).toBe(true);
            
            expect(isEqual(42, 43)).toBe(false);
            expect(isEqual('hello', 'world')).toBe(false);
            expect(isEqual(true, false)).toBe(false);
            expect(isEqual(null, undefined)).toBe(false);
        });

        it('should compare objects', () => {
            expect(isEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
            expect(isEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
            
            expect(isEqual({ a: 1 }, { a: 2 })).toBe(false);
            expect(isEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
        });

        it('should compare arrays', () => {
            expect(isEqual([1, 2, 3], [1, 2, 3])).toBe(true);
            expect(isEqual([], [])).toBe(true);
            
            expect(isEqual([1, 2], [2, 1])).toBe(false);
            expect(isEqual([1], [1, 2])).toBe(false);
        });

        it('should compare nested structures', () => {
            const obj1 = { a: { b: [1, 2, { c: 3 }] } };
            const obj2 = { a: { b: [1, 2, { c: 3 }] } };
            const obj3 = { a: { b: [1, 2, { c: 4 }] } };
            
            expect(isEqual(obj1, obj2)).toBe(true);
            expect(isEqual(obj1, obj3)).toBe(false);
        });

        it('should handle type mismatches', () => {
            expect(isEqual([], {})).toBe(false);
            expect(isEqual('42', 42)).toBe(false);
            expect(isEqual(null, 0)).toBe(false);
        });
    });

    describe('mapValues', () => {
        it('should transform object values', () => {
            const obj = { a: 1, b: 2, c: 3 };
            const result = mapValues(obj, x => x * 2);
            expect(result).toEqual({ a: 2, b: 4, c: 6 });
        });

        it('should pass key to transform function', () => {
            const obj = { a: 1, b: 2 };
            const result = mapValues(obj, (val, key) => `${key}:${val}`);
            expect(result).toEqual({ a: 'a:1', b: 'b:2' });
        });

        it('should handle empty objects', () => {
            expect(mapValues({}, x => x)).toEqual({});
        });
    });

    describe('filterObject', () => {
        it('should filter object by predicate', () => {
            const obj = { a: 1, b: 2, c: 3, d: 4 };
            const result = filterObject(obj, x => x % 2 === 0);
            expect(result).toEqual({ b: 2, d: 4 });
        });

        it('should pass key to predicate', () => {
            const obj = { a: 1, b: 2, c: 3 };
            const result = filterObject(obj, (val, key) => key !== 'b');
            expect(result).toEqual({ a: 1, c: 3 });
        });

        it('should handle empty objects', () => {
            expect(filterObject({}, () => true)).toEqual({});
        });

        it('should return empty when all filtered out', () => {
            const obj = { a: 1, b: 2 };
            expect(filterObject(obj, () => false)).toEqual({});
        });
    });

    describe('isEmpty', () => {
        it('should return true for empty objects', () => {
            expect(isEmpty({})).toBe(true);
            expect(isEmpty([])).toBe(true);
            expect(isEmpty(null)).toBe(true);
            expect(isEmpty(undefined)).toBe(true);
        });

        it('should return false for non-empty objects', () => {
            expect(isEmpty({ a: 1 })).toBe(false);
            expect(isEmpty([1])).toBe(false);
        });

        it('should handle non-objects', () => {
            expect(isEmpty(0)).toBe(false);
            expect(isEmpty('')).toBe(false);
            expect(isEmpty(false)).toBe(false);
        });
    });

    describe('invert', () => {
        it('should invert object keys and values', () => {
            const obj = { a: 'x', b: 'y', c: 'z' };
            expect(invert(obj)).toEqual({ x: 'a', y: 'b', z: 'c' });
        });

        it('should handle duplicate values', () => {
            const obj = { a: 'x', b: 'x', c: 'z' };
            const result = invert(obj);
            expect(result.z).toBe('c');
            // Last occurrence wins for duplicates
            expect(['a', 'b']).toContain(result.x);
        });

        it('should handle empty objects', () => {
            expect(invert({})).toEqual({});
        });
    });
});