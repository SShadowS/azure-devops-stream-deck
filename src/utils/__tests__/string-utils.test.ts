import {
    truncate,
    capitalize,
    toTitleCase,
    trim,
    isEmpty,
    padLeft,
    padRight,
    replaceAll,
    countOccurrences,
    reverse,
    contains,
    extractNumbers,
    stripHtml,
    toSlug,
    isValidEmail
} from '../string-utils';

describe('String Utilities', () => {
    describe('truncate', () => {
        it('should truncate long strings', () => {
            expect(truncate('Hello World', 5)).toBe('He...');
            expect(truncate('This is a long string', 10)).toBe('This is...');
        });

        it('should not truncate short strings', () => {
            expect(truncate('Hello', 10)).toBe('Hello');
            expect(truncate('Hi', 5)).toBe('Hi');
        });

        it('should handle custom suffix', () => {
            expect(truncate('Hello World', 8, '…')).toBe('Hello W…');
            expect(truncate('Testing', 4, '!!')).toBe('Te!!');
        });

        it('should handle empty or null strings', () => {
            expect(truncate('', 5)).toBe('');
            expect(truncate(null as any, 5)).toBe(null);
        });
    });

    describe('capitalize', () => {
        it('should capitalize first letter', () => {
            expect(capitalize('hello')).toBe('Hello');
            expect(capitalize('world')).toBe('World');
        });

        it('should handle already capitalized strings', () => {
            expect(capitalize('Hello')).toBe('Hello');
            expect(capitalize('WORLD')).toBe('WORLD');
        });

        it('should handle empty strings', () => {
            expect(capitalize('')).toBe('');
            expect(capitalize(null as any)).toBe(null);
        });
    });

    describe('toTitleCase', () => {
        it('should convert to title case', () => {
            expect(toTitleCase('hello world')).toBe('Hello World');
            expect(toTitleCase('the quick brown fox')).toBe('The Quick Brown Fox');
        });

        it('should handle mixed case', () => {
            expect(toTitleCase('hELLo WoRLD')).toBe('Hello World');
        });

        it('should handle empty strings', () => {
            expect(toTitleCase('')).toBe('');
            expect(toTitleCase(null as any)).toBe(null);
        });
    });

    describe('trim', () => {
        it('should trim whitespace', () => {
            expect(trim('  hello  ')).toBe('hello');
            expect(trim('\t\nhello\r\n')).toBe('hello');
        });

        it('should handle strings without whitespace', () => {
            expect(trim('hello')).toBe('hello');
        });

        it('should handle empty strings', () => {
            expect(trim('')).toBe('');
            expect(trim(null as any)).toBe(null);
        });
    });

    describe('isEmpty', () => {
        it('should return true for empty strings', () => {
            expect(isEmpty('')).toBe(true);
            expect(isEmpty('   ')).toBe(true);
            expect(isEmpty('\t\n\r')).toBe(true);
        });

        it('should return false for non-empty strings', () => {
            expect(isEmpty('hello')).toBe(false);
            expect(isEmpty('  hello  ')).toBe(false);
        });

        it('should handle null/undefined', () => {
            expect(isEmpty(null as any)).toBe(true);
            expect(isEmpty(undefined as any)).toBe(true);
        });
    });

    describe('padLeft', () => {
        it('should pad strings on the left', () => {
            expect(padLeft('5', 3, '0')).toBe('005');
            expect(padLeft('hi', 5)).toBe('   hi');
        });

        it('should not pad strings already at length', () => {
            expect(padLeft('hello', 5)).toBe('hello');
            expect(padLeft('world', 3)).toBe('world');
        });

        it('should handle empty strings', () => {
            expect(padLeft('', 3, '0')).toBe('000');
            expect(padLeft(null as any, 3, '0')).toBe('000');
        });
    });

    describe('padRight', () => {
        it('should pad strings on the right', () => {
            expect(padRight('5', 3, '0')).toBe('500');
            expect(padRight('hi', 5)).toBe('hi   ');
        });

        it('should not pad strings already at length', () => {
            expect(padRight('hello', 5)).toBe('hello');
            expect(padRight('world', 3)).toBe('world');
        });

        it('should handle empty strings', () => {
            expect(padRight('', 3, '0')).toBe('000');
            expect(padRight(null as any, 3, '0')).toBe('000');
        });
    });

    describe('replaceAll', () => {
        it('should replace all occurrences', () => {
            expect(replaceAll('hello world', 'o', '0')).toBe('hell0 w0rld');
            expect(replaceAll('aaaa', 'a', 'b')).toBe('bbbb');
        });

        it('should handle no matches', () => {
            expect(replaceAll('hello', 'x', 'y')).toBe('hello');
        });

        it('should handle empty strings', () => {
            expect(replaceAll('', 'a', 'b')).toBe('');
            expect(replaceAll(null as any, 'a', 'b')).toBe(null);
        });
    });

    describe('countOccurrences', () => {
        it('should count occurrences', () => {
            expect(countOccurrences('hello world', 'o')).toBe(2);
            expect(countOccurrences('aaaa', 'a')).toBe(4);
            expect(countOccurrences('hello', 'll')).toBe(1);
        });

        it('should return 0 for no matches', () => {
            expect(countOccurrences('hello', 'x')).toBe(0);
        });

        it('should handle empty strings', () => {
            expect(countOccurrences('', 'a')).toBe(0);
            expect(countOccurrences('hello', '')).toBe(0);
            expect(countOccurrences(null as any, 'a')).toBe(0);
        });
    });

    describe('reverse', () => {
        it('should reverse strings', () => {
            expect(reverse('hello')).toBe('olleh');
            expect(reverse('12345')).toBe('54321');
        });

        it('should handle single characters', () => {
            expect(reverse('a')).toBe('a');
        });

        it('should handle empty strings', () => {
            expect(reverse('')).toBe('');
            expect(reverse(null as any)).toBe(null);
        });
    });

    describe('contains', () => {
        it('should check for substring case-sensitive', () => {
            expect(contains('hello world', 'world')).toBe(true);
            expect(contains('hello world', 'World')).toBe(false);
        });

        it('should check for substring case-insensitive', () => {
            expect(contains('hello world', 'WORLD', false)).toBe(true);
            expect(contains('HELLO', 'hello', false)).toBe(true);
        });

        it('should return false for no match', () => {
            expect(contains('hello', 'bye')).toBe(false);
        });

        it('should handle empty strings', () => {
            expect(contains('', 'a')).toBe(false);
            expect(contains('hello', '')).toBe(false);
            expect(contains(null as any, 'a')).toBe(false);
        });
    });

    describe('extractNumbers', () => {
        it('should extract numbers from string', () => {
            expect(extractNumbers('abc123def456')).toEqual([123, 456]);
            expect(extractNumbers('The year is 2024')).toEqual([2024]);
        });

        it('should return empty array for no numbers', () => {
            expect(extractNumbers('hello world')).toEqual([]);
        });

        it('should handle empty strings', () => {
            expect(extractNumbers('')).toEqual([]);
            expect(extractNumbers(null as any)).toEqual([]);
        });
    });

    describe('stripHtml', () => {
        it('should remove HTML tags', () => {
            expect(stripHtml('<p>Hello</p>')).toBe('Hello');
            expect(stripHtml('<div><span>Test</span></div>')).toBe('Test');
            expect(stripHtml('Hello <b>World</b>!')).toBe('Hello World!');
        });

        it('should handle strings without HTML', () => {
            expect(stripHtml('Hello World')).toBe('Hello World');
        });

        it('should handle empty strings', () => {
            expect(stripHtml('')).toBe('');
            expect(stripHtml(null as any)).toBe(null);
        });
    });

    describe('toSlug', () => {
        it('should convert to slug', () => {
            expect(toSlug('Hello World')).toBe('hello-world');
            expect(toSlug('This & That!')).toBe('this-that');
            expect(toSlug('  Multiple   Spaces  ')).toBe('multiple-spaces');
        });

        it('should handle special characters', () => {
            expect(toSlug('Hello@World#2024')).toBe('helloworld2024');
        });

        it('should handle empty strings', () => {
            expect(toSlug('')).toBe('');
            expect(toSlug(null as any)).toBe(null);
        });
    });

    describe('isValidEmail', () => {
        it('should validate correct emails', () => {
            expect(isValidEmail('test@example.com')).toBe(true);
            expect(isValidEmail('user.name@domain.co.uk')).toBe(true);
            expect(isValidEmail('123@test.org')).toBe(true);
        });

        it('should invalidate incorrect emails', () => {
            expect(isValidEmail('notanemail')).toBe(false);
            expect(isValidEmail('@example.com')).toBe(false);
            expect(isValidEmail('test@')).toBe(false);
            expect(isValidEmail('test@.com')).toBe(false);
        });

        it('should handle empty strings', () => {
            expect(isValidEmail('')).toBe(false);
            expect(isValidEmail(null as any)).toBe(false);
        });
    });
});