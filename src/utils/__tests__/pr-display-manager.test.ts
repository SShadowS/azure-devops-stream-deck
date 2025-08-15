import { PRDisplayManager } from '../pr-display-manager';
import { PullRequest } from '../../services/pr-service';

describe('PRDisplayManager', () => {
    const createMockPR = (overrides: Partial<PullRequest> = {}): PullRequest => ({
        id: 1,
        title: 'Test PR',
        author: 'Test Author',
        targetBranch: 'main',
        sourceBranch: 'feature',
        status: 'active',
        createdDate: new Date(),
        url: 'https://test.url',
        reviewers: [],
        hasConflicts: false,
        isDraft: false,
        repository: 'TestRepo',
        ...overrides
    });

    describe('generateTitle', () => {
        it('should show "No PRs" when list is empty', () => {
            const title = PRDisplayManager.generateTitle([]);
            expect(title).toBe('No PRs');
        });

        it('should show single PR count', () => {
            const prs = [createMockPR()];
            const title = PRDisplayManager.generateTitle(prs);
            expect(title).toContain('1 PR');
        });

        it('should show multiple PR count', () => {
            const prs = [
                createMockPR({ id: 1 }),
                createMockPR({ id: 2 }),
                createMockPR({ id: 3 })
            ];
            const title = PRDisplayManager.generateTitle(prs);
            expect(title).toContain('3 PRs');
        });

        it('should show conflict indicator', () => {
            const prs = [
                createMockPR({ hasConflicts: true }),
                createMockPR({ hasConflicts: false })
            ];
            const title = PRDisplayManager.generateTitle(prs);
            expect(title).toContain('⚠ 1');
        });

        it('should show draft indicator', () => {
            const prs = [
                createMockPR({ isDraft: true }),
                createMockPR({ isDraft: false })
            ];
            const title = PRDisplayManager.generateTitle(prs);
            expect(title).toContain('✏ 1');
        });

        it('should show age of oldest PR', () => {
            const oldDate = new Date();
            oldDate.setDate(oldDate.getDate() - 5);
            
            const prs = [
                createMockPR({ createdDate: oldDate }),
                createMockPR({ createdDate: new Date() })
            ];
            const title = PRDisplayManager.generateTitle(prs);
            expect(title).toContain('5d old');
        });

        it('should not show age for PRs created today', () => {
            const prs = [createMockPR({ createdDate: new Date() })];
            const title = PRDisplayManager.generateTitle(prs);
            expect(title).not.toContain('d old');
        });
    });

    describe('generateImage', () => {
        it('should return success image for no PRs', () => {
            const image = PRDisplayManager.generateImage([]);
            expect(image).toContain('data:image/svg+xml;base64,');
            expect(Buffer.from(image.split(',')[1], 'base64').toString()).toContain('#0E7C3A');
        });

        it('should return conflict image for PRs with conflicts', () => {
            const prs = [createMockPR({ hasConflicts: true })];
            const image = PRDisplayManager.generateImage(prs);
            expect(Buffer.from(image.split(',')[1], 'base64').toString()).toContain('#D13438');
        });

        it('should return warning image for old PRs', () => {
            const oldDate = new Date();
            oldDate.setDate(oldDate.getDate() - 8);
            
            const prs = [createMockPR({ createdDate: oldDate })];
            const image = PRDisplayManager.generateImage(prs);
            expect(Buffer.from(image.split(',')[1], 'base64').toString()).toContain('#F2C94C');
        });

        it('should return pending image for PRs with waiting reviews', () => {
            const prs = [createMockPR({
                reviewers: [{
                    displayName: 'Reviewer',
                    vote: -5, // Waiting
                    isRequired: false
                }]
            })];
            const image = PRDisplayManager.generateImage(prs);
            expect(Buffer.from(image.split(',')[1], 'base64').toString()).toContain('#106EBE');
        });

        it('should prioritize conflicts over other states', () => {
            const oldDate = new Date();
            oldDate.setDate(oldDate.getDate() - 8);
            
            const prs = [
                createMockPR({ hasConflicts: true }),
                createMockPR({ createdDate: oldDate })
            ];
            const image = PRDisplayManager.generateImage(prs);
            // Should return conflict (red) image
            expect(Buffer.from(image.split(',')[1], 'base64').toString()).toContain('#D13438');
        });
    });

    describe('formatPRCount', () => {
        it('should format zero PRs', () => {
            expect(PRDisplayManager.formatPRCount(0)).toBe('No PRs');
        });

        it('should format single PR', () => {
            expect(PRDisplayManager.formatPRCount(1)).toBe('1 PR');
        });

        it('should format multiple PRs', () => {
            expect(PRDisplayManager.formatPRCount(5)).toBe('5 PRs');
        });

        it('should cap at 99+ for large numbers', () => {
            expect(PRDisplayManager.formatPRCount(100)).toBe('99+ PRs');
            expect(PRDisplayManager.formatPRCount(200)).toBe('99+ PRs');
        });
    });

    describe('getPRStatusColor', () => {
        it('should return green for no PRs', () => {
            const color = PRDisplayManager.getPRStatusColor([]);
            expect(color).toBe('#0E7C3A');
        });

        it('should return red for PRs with conflicts', () => {
            const prs = [createMockPR({ hasConflicts: true })];
            const color = PRDisplayManager.getPRStatusColor(prs);
            expect(color).toBe('#D13438');
        });

        it('should return yellow for old PRs', () => {
            const oldDate = new Date();
            oldDate.setDate(oldDate.getDate() - 8);
            
            const prs = [createMockPR({ createdDate: oldDate })];
            const color = PRDisplayManager.getPRStatusColor(prs);
            expect(color).toBe('#F2C94C');
        });

        it('should return blue for normal active PRs', () => {
            const prs = [createMockPR()];
            const color = PRDisplayManager.getPRStatusColor(prs);
            expect(color).toBe('#0078D4');
        });
    });

    describe('getErrorImage', () => {
        it('should return error image SVG', () => {
            const image = PRDisplayManager.getErrorImage();
            expect(image).toContain('data:image/svg+xml;base64,');
            const svg = Buffer.from(image.split(',')[1], 'base64').toString();
            expect(svg).toContain('#A80000');
            expect(svg).toContain('M30 30L42 42M42 30L30 42'); // X mark
        });
    });
});