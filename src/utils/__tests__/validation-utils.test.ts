import {
    isNumber,
    isString,
    isBoolean,
    isObject,
    isArray,
    isNullOrUndefined,
    isFunction,
    isValidUrl,
    isInRange,
    matchesPattern,
    hasRequiredProps,
    isPositiveNumber,
    isNonEmptyString,
    isValidEnumValue,
    allValid
} from '../validation-utils';

describe('Validation Utilities', () => {
    describe('isNumber', () => {
        it('should return true for numbers', () => {
            expect(isNumber(42)).toBe(true);
            expect(isNumber(0)).toBe(true);
            expect(isNumber(-10)).toBe(true);
            expect(isNumber(3.14)).toBe(true);
        });

        it('should return false for non-numbers', () => {
            expect(isNumber('42')).toBe(false);
            expect(isNumber(NaN)).toBe(false);
            expect(isNumber(null)).toBe(false);
            expect(isNumber(undefined)).toBe(false);
        });
    });

    describe('isString', () => {
        it('should return true for strings', () => {
            expect(isString('hello')).toBe(true);
            expect(isString('')).toBe(true);
            expect(isString('123')).toBe(true);
        });

        it('should return false for non-strings', () => {
            expect(isString(123)).toBe(false);
            expect(isString(null)).toBe(false);
            expect(isString(undefined)).toBe(false);
        });
    });

    describe('isBoolean', () => {
        it('should return true for booleans', () => {
            expect(isBoolean(true)).toBe(true);
            expect(isBoolean(false)).toBe(true);
        });

        it('should return false for non-booleans', () => {
            expect(isBoolean(1)).toBe(false);
            expect(isBoolean('true')).toBe(false);
            expect(isBoolean(null)).toBe(false);
        });
    });

    describe('isObject', () => {
        it('should return true for objects', () => {
            expect(isObject({})).toBe(true);
            expect(isObject({ key: 'value' })).toBe(true);
        });

        it('should return false for non-objects', () => {
            expect(isObject([])).toBe(false);
            expect(isObject(null)).toBe(false);
            expect(isObject('object')).toBe(false);
            expect(isObject(42)).toBe(false);
        });
    });

    describe('isArray', () => {
        it('should return true for arrays', () => {
            expect(isArray([])).toBe(true);
            expect(isArray([1, 2, 3])).toBe(true);
        });

        it('should return false for non-arrays', () => {
            expect(isArray({})).toBe(false);
            expect(isArray('array')).toBe(false);
            expect(isArray(null)).toBe(false);
        });
    });

    describe('isNullOrUndefined', () => {
        it('should return true for null or undefined', () => {
            expect(isNullOrUndefined(null)).toBe(true);
            expect(isNullOrUndefined(undefined)).toBe(true);
        });

        it('should return false for other values', () => {
            expect(isNullOrUndefined(0)).toBe(false);
            expect(isNullOrUndefined('')).toBe(false);
            expect(isNullOrUndefined(false)).toBe(false);
        });
    });

    describe('isFunction', () => {
        it('should return true for functions', () => {
            expect(isFunction(() => {})).toBe(true);
            expect(isFunction(function() {})).toBe(true);
            expect(isFunction(Math.max)).toBe(true);
        });

        it('should return false for non-functions', () => {
            expect(isFunction({})).toBe(false);
            expect(isFunction('function')).toBe(false);
            expect(isFunction(null)).toBe(false);
        });
    });

    describe('isValidUrl', () => {
        it('should return true for valid URLs', () => {
            expect(isValidUrl('https://example.com')).toBe(true);
            expect(isValidUrl('http://localhost:3000')).toBe(true);
            expect(isValidUrl('ftp://files.com')).toBe(true);
        });

        it('should return false for invalid URLs', () => {
            expect(isValidUrl('not a url')).toBe(false);
            expect(isValidUrl('example.com')).toBe(false);
            expect(isValidUrl('')).toBe(false);
        });
    });

    describe('isInRange', () => {
        it('should return true for values in range', () => {
            expect(isInRange(5, 0, 10)).toBe(true);
            expect(isInRange(0, 0, 10)).toBe(true);
            expect(isInRange(10, 0, 10)).toBe(true);
        });

        it('should return false for values out of range', () => {
            expect(isInRange(-1, 0, 10)).toBe(false);
            expect(isInRange(11, 0, 10)).toBe(false);
        });

        it('should return false for non-numbers', () => {
            expect(isInRange('5' as any, 0, 10)).toBe(false);
            expect(isInRange(NaN, 0, 10)).toBe(false);
        });
    });

    describe('matchesPattern', () => {
        it('should return true for matching patterns', () => {
            expect(matchesPattern('hello', /^hello$/)).toBe(true);
            expect(matchesPattern('123', /^\d+$/)).toBe(true);
        });

        it('should return false for non-matching patterns', () => {
            expect(matchesPattern('hello', /^world$/)).toBe(false);
            expect(matchesPattern('abc', /^\d+$/)).toBe(false);
        });

        it('should return false for non-strings', () => {
            expect(matchesPattern(123 as any, /^\d+$/)).toBe(false);
        });
    });

    describe('hasRequiredProps', () => {
        it('should return true when all props exist', () => {
            const obj = { a: 1, b: 2, c: 3 };
            expect(hasRequiredProps(obj, ['a', 'b'])).toBe(true);
            expect(hasRequiredProps(obj, [])).toBe(true);
        });

        it('should return false when props missing', () => {
            const obj = { a: 1 };
            expect(hasRequiredProps(obj, ['a', 'b'])).toBe(false);
        });

        it('should return false for non-objects', () => {
            expect(hasRequiredProps(null, ['a'])).toBe(false);
            expect(hasRequiredProps([], ['a'])).toBe(false);
        });
    });

    describe('isPositiveNumber', () => {
        it('should return true for positive numbers', () => {
            expect(isPositiveNumber(1)).toBe(true);
            expect(isPositiveNumber(0.1)).toBe(true);
            expect(isPositiveNumber(100)).toBe(true);
        });

        it('should return false for non-positive numbers', () => {
            expect(isPositiveNumber(0)).toBe(false);
            expect(isPositiveNumber(-1)).toBe(false);
        });

        it('should return false for non-numbers', () => {
            expect(isPositiveNumber('1')).toBe(false);
            expect(isPositiveNumber(null)).toBe(false);
        });
    });

    describe('isNonEmptyString', () => {
        it('should return true for non-empty strings', () => {
            expect(isNonEmptyString('hello')).toBe(true);
            expect(isNonEmptyString('  text  ')).toBe(true);
        });

        it('should return false for empty strings', () => {
            expect(isNonEmptyString('')).toBe(false);
            expect(isNonEmptyString('   ')).toBe(false);
        });

        it('should return false for non-strings', () => {
            expect(isNonEmptyString(123)).toBe(false);
            expect(isNonEmptyString(null)).toBe(false);
        });
    });

    describe('isValidEnumValue', () => {
        enum TestEnum {
            A = 'a',
            B = 'b',
            C = 'c'
        }

        it('should return true for valid enum values', () => {
            expect(isValidEnumValue('a', TestEnum)).toBe(true);
            expect(isValidEnumValue('b', TestEnum)).toBe(true);
        });

        it('should return false for invalid enum values', () => {
            expect(isValidEnumValue('d', TestEnum)).toBe(false);
            expect(isValidEnumValue(123, TestEnum)).toBe(false);
        });
    });

    describe('allValid', () => {
        it('should return true when all items pass', () => {
            expect(allValid([2, 4, 6], x => x % 2 === 0)).toBe(true);
            expect(allValid([], x => false)).toBe(true);
        });

        it('should return false when any item fails', () => {
            expect(allValid([2, 3, 4], x => x % 2 === 0)).toBe(false);
        });

        it('should return false for non-arrays', () => {
            expect(allValid(null as any, x => true)).toBe(false);
        });
    });
});