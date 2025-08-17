import {
    unique,
    chunk,
    flatten,
    shuffle,
    sample,
    groupBy,
    intersection,
    difference,
    partition,
    countBy
} from '../array-utils';

describe('Array Utilities', () => {
    describe('unique', () => {
        it('should remove duplicates', () => {
            expect(unique([1, 2, 2, 3, 3, 3])).toEqual([1, 2, 3]);
            expect(unique(['a', 'b', 'a', 'c'])).toEqual(['a', 'b', 'c']);
        });

        it('should handle arrays without duplicates', () => {
            expect(unique([1, 2, 3])).toEqual([1, 2, 3]);
        });

        it('should handle empty arrays', () => {
            expect(unique([])).toEqual([]);
        });
    });

    describe('chunk', () => {
        it('should split array into chunks', () => {
            expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
            expect(chunk(['a', 'b', 'c', 'd'], 3)).toEqual([['a', 'b', 'c'], ['d']]);
        });

        it('should handle chunk size larger than array', () => {
            expect(chunk([1, 2, 3], 5)).toEqual([[1, 2, 3]]);
        });

        it('should handle empty arrays', () => {
            expect(chunk([], 2)).toEqual([]);
        });
    });

    describe('flatten', () => {
        it('should flatten nested arrays', () => {
            expect(flatten([1, [2, 3], 4])).toEqual([1, 2, 3, 4]);
            expect(flatten([[1, 2], [3, 4]])).toEqual([1, 2, 3, 4]);
        });

        it('should handle deeply nested arrays', () => {
            expect(flatten([1, [2, [3, [4]]]])).toEqual([1, 2, 3, 4]);
        });

        it('should handle arrays without nesting', () => {
            expect(flatten([1, 2, 3])).toEqual([1, 2, 3]);
        });

        it('should handle empty arrays', () => {
            expect(flatten([])).toEqual([]);
        });
    });

    describe('shuffle', () => {
        it('should return array with same elements', () => {
            const arr = [1, 2, 3, 4, 5];
            const shuffled = shuffle(arr);
            expect(shuffled.length).toBe(arr.length);
            expect(shuffled.sort()).toEqual(arr.sort());
        });

        it('should not modify original array', () => {
            const arr = [1, 2, 3];
            const original = [...arr];
            shuffle(arr);
            expect(arr).toEqual(original);
        });

        it('should handle empty arrays', () => {
            expect(shuffle([])).toEqual([]);
        });
    });

    describe('sample', () => {
        it('should return element from array', () => {
            const arr = [1, 2, 3];
            const result = sample(arr);
            expect(arr).toContain(result);
        });

        it('should return undefined for empty array', () => {
            expect(sample([])).toBeUndefined();
        });

        it('should return only element for single-item array', () => {
            expect(sample([42])).toBe(42);
        });
    });

    describe('groupBy', () => {
        it('should group objects by key', () => {
            const data = [
                { type: 'fruit', name: 'apple' },
                { type: 'fruit', name: 'banana' },
                { type: 'vegetable', name: 'carrot' }
            ];
            
            const grouped = groupBy(data, 'type');
            
            expect(grouped['fruit']).toHaveLength(2);
            expect(grouped['vegetable']).toHaveLength(1);
        });

        it('should handle empty arrays', () => {
            expect(groupBy([], 'key' as any)).toEqual({});
        });
    });

    describe('intersection', () => {
        it('should find common elements', () => {
            expect(intersection([1, 2, 3], [2, 3, 4])).toEqual([2, 3]);
            expect(intersection(['a', 'b'], ['b', 'c'])).toEqual(['b']);
        });

        it('should handle no common elements', () => {
            expect(intersection([1, 2], [3, 4])).toEqual([]);
        });

        it('should handle empty arrays', () => {
            expect(intersection([], [1, 2])).toEqual([]);
            expect(intersection([1, 2], [])).toEqual([]);
        });
    });

    describe('difference', () => {
        it('should find elements in first but not second', () => {
            expect(difference([1, 2, 3], [2, 3, 4])).toEqual([1]);
            expect(difference(['a', 'b', 'c'], ['b'])).toEqual(['a', 'c']);
        });

        it('should return all elements when no overlap', () => {
            expect(difference([1, 2], [3, 4])).toEqual([1, 2]);
        });

        it('should handle empty arrays', () => {
            expect(difference([], [1, 2])).toEqual([]);
            expect(difference([1, 2], [])).toEqual([1, 2]);
        });
    });

    describe('partition', () => {
        it('should partition based on predicate', () => {
            const [evens, odds] = partition([1, 2, 3, 4, 5], x => x % 2 === 0);
            expect(evens).toEqual([2, 4]);
            expect(odds).toEqual([1, 3, 5]);
        });

        it('should handle all pass', () => {
            const [pass, fail] = partition([2, 4, 6], x => x % 2 === 0);
            expect(pass).toEqual([2, 4, 6]);
            expect(fail).toEqual([]);
        });

        it('should handle all fail', () => {
            const [pass, fail] = partition([1, 3, 5], x => x % 2 === 0);
            expect(pass).toEqual([]);
            expect(fail).toEqual([1, 3, 5]);
        });

        it('should handle empty arrays', () => {
            const [pass, fail] = partition([], x => true);
            expect(pass).toEqual([]);
            expect(fail).toEqual([]);
        });
    });

    describe('countBy', () => {
        it('should count occurrences', () => {
            const counts = countBy([1, 2, 2, 3, 3, 3]);
            expect(counts.get(1)).toBe(1);
            expect(counts.get(2)).toBe(2);
            expect(counts.get(3)).toBe(3);
        });

        it('should handle strings', () => {
            const counts = countBy(['a', 'b', 'a', 'c', 'b', 'a']);
            expect(counts.get('a')).toBe(3);
            expect(counts.get('b')).toBe(2);
            expect(counts.get('c')).toBe(1);
        });

        it('should handle empty arrays', () => {
            const counts = countBy([]);
            expect(counts.size).toBe(0);
        });
    });
});