# Pull Request Status Display - Feature Plan

## Overview
Add a new Stream Deck action to display open pull requests for an Azure DevOps repository with commonly used filters. This feature will complement the existing pipeline status display by providing visibility into the PR queue directly from the Stream Deck.

## Technical Approach
- **Leverage existing infrastructure**: Use the already installed `azure-devops-node-api` (v15.1.1) library
- **Extend current architecture**: Follow the same patterns as the pipeline status action
- **Use official GitApi**: Utilize Microsoft's official GitApi from the azure-devops-node-api package

## Implementation Plan

### 1. Extend Azure DevOps Client (`src/services/azure-devops-client.ts`)
**Additions needed:**
- Import GitApi types: `import * as GitApi from 'azure-devops-node-api/GitApi'`
- Add private property: `private gitApi: GitApi.IGitApi | null = null`
- Add initialization in `connect()` method: `this.gitApi = await this.connection.getGitApi()`
- Add public accessor: `getGitApi(): GitApi.IGitApi`
- Add repository listing method for UI dropdown population

### 2. Create Pull Request Service (`src/services/pull-request-service.ts`)
**Core functionality:**
```typescript
import * as GitInterfaces from 'azure-devops-node-api/interfaces/GitInterfaces';

export class PullRequestService {
    // Methods to implement:
    - getPullRequests(repositoryId, searchCriteria)
    - getPullRequestCounts(repositoryId, filters)
    - getRepositories(project)
    // Caching layer to minimize API calls
    // Support for GitSearchCriteria filters
}
```

**Supported filters using GitInterfaces.GitPullRequestSearchCriteria:**
- `status`: Active (default), Completed, Abandoned, All
- `creatorId`: Filter by PR author
- `reviewerId`: Filter by assigned reviewer
- `sourceRefName`: Source branch filter
- `targetRefName`: Target branch (e.g., "refs/heads/main", "refs/heads/develop")
- `minTime`/`maxTime`: Date range for PR creation

### 3. Create Pull Request Action (`src/actions/pull-request-status.ts`)
**Key features:**
- Extend `SingletonAction<PullRequestSettings>` following existing patterns
- Use `@action` decorator with UUID: `com.sshadows.azure-devops-info.pullrequeststatus`
- Display modes:
  - PR count badge (e.g., "5 PRs")
  - Oldest PR age indicator (e.g., "3d old")
  - Combined view (e.g., "5 PRs • 3d")
  - Rotating PR titles for detailed view
- Color states based on:
  - No PRs (green)
  - 1-5 PRs (yellow)
  - 6+ PRs (orange)
  - PRs older than threshold (red)
- Handle `onKeyDown` to open Azure DevOps PR list in browser
- Implement polling with configurable refresh interval

**Settings interface:**
```typescript
type PullRequestSettings = {
    organizationUrl?: string;
    projectName?: string;
    repositoryId?: string;  // Specific repo or 'all'
    personalAccessToken?: string;
    
    // Filters
    statusFilter?: 'active' | 'completed' | 'abandoned' | 'all';
    targetBranch?: string;  // e.g., 'main', 'develop'
    creatorFilter?: 'anyone' | 'me';  // 'me' requires username setting
    reviewerFilter?: 'anyone' | 'me';
    maxAge?: number;  // Days, for highlighting old PRs
    
    // Display options
    refreshInterval?: number;  // seconds
    displayFormat?: 'count' | 'age' | 'title' | 'combined';
    showMergeConflicts?: boolean;
    alertThreshold?: number;  // PR count for alert
}
```

### 4. Update Plugin Manifest (`manifest.json`)
**Add new action:**
```json
{
    "Name": "Pull Request Status",
    "UUID": "com.sshadows.azure-devops-info.pullrequeststatus",
    "Icon": "imgs/actions/pull-request-status/icon",
    "Tooltip": "Displays open pull requests for an Azure DevOps repository",
    "PropertyInspectorPath": "ui/pull-request-status.html",
    "Controllers": ["Keypad"],
    "States": [
        {
            "Image": "imgs/actions/pull-request-status/none",
            "TitleAlignment": "middle",
            "Name": "No PRs"
        },
        {
            "Image": "imgs/actions/pull-request-status/few",
            "TitleAlignment": "middle",
            "Name": "Few PRs"
        },
        {
            "Image": "imgs/actions/pull-request-status/many",
            "TitleAlignment": "middle",
            "Name": "Many PRs"
        },
        {
            "Image": "imgs/actions/pull-request-status/critical",
            "TitleAlignment": "middle",
            "Name": "Critical"
        }
    ]
}
```

### 5. Create Property Inspector UI (`ui/pull-request-status.html`)
**Configuration elements:**
- Organization URL (reuse from pipeline if same)
- Project Name
- Repository dropdown (populated via API)
- Personal Access Token (encrypted storage)
- **Filter Section:**
  - Status dropdown (Active/Completed/Abandoned/All)
  - Target Branch text field with suggestions
  - Creator filter (Anyone/Me + username field)
  - Reviewer filter (Anyone/Me)
  - Max PR Age slider (1-30 days)
- **Display Section:**
  - Refresh interval slider (10-300 seconds)
  - Display format dropdown
  - Alert threshold number input
  - Show merge conflicts checkbox
- Test Connection button (validates repo access)
- Debug log area (following existing pattern)

### 6. Create Icon Assets (`imgs/actions/pull-request-status/`)
**Required icons:**
- `icon.svg` - Action icon for Stream Deck UI
- `none.svg` - Green state (no open PRs)
- `few.svg` - Yellow state (1-5 PRs)
- `many.svg` - Orange state (6+ PRs)
- `critical.svg` - Red state (old/critical PRs)

Design should include:
- PR icon/symbol
- Number badge overlay capability
- Clear color differentiation
- Consistent with existing pipeline status icons

### 7. Add Display Utilities (`src/utils/pr-display.ts`)
**Formatting helpers:**
```typescript
export class PRDisplayManager {
    formatPRCount(count: number, format: DisplayFormat): string
    formatPRAge(oldestPR: Date): string
    formatPRTitle(pr: GitPullRequest, maxLength: number): string
    getStateForPRCount(count: number, threshold: number): number
    getColorForAge(age: number, maxAge: number): string
}
```

## Testing Requirements

### Unit Tests
- `src/services/pull-request-service.test.ts`
  - Test filter combinations
  - Test caching behavior
  - Test error handling
- `src/actions/pull-request-status.test.ts`
  - Test state transitions
  - Test display formatting
  - Test polling mechanism

### Integration Tests
- Test with real Azure DevOps instance
- Verify all filter combinations
- Test repository switching
- Validate performance with large PR lists

### Manual Testing Checklist
- [ ] Configure with valid Azure DevOps credentials
- [ ] Test all filter combinations
- [ ] Verify refresh interval works correctly
- [ ] Test button press opens correct URL
- [ ] Validate state changes with PR count
- [ ] Test error states (invalid repo, no access)
- [ ] Verify caching reduces API calls
- [ ] Test with multiple repositories
- [ ] Validate Property Inspector updates

## API Considerations

### Rate Limiting
- Implement exponential backoff (already in client)
- Cache PR data with TTL
- Minimum refresh interval of 10 seconds
- Bundle API calls where possible

### Permissions Required
- Personal Access Token needs:
  - Code (read) - for repository access
  - Pull Request (read) - for PR data
  - Project and team (read) - for project info

## Future Enhancements (Post-MVP)

1. **Quick Actions**
   - Long press for PR summary popup
   - Multi-action support (approve, request changes)

2. **Advanced Filters**
   - Label/tag filtering
   - Build status integration
   - Conflict detection highlighting

3. **Notifications**
   - Desktop notifications for new PRs
   - Sound alerts for critical PRs
   - LED feedback on Stream Deck+

4. **Multi-Repository Support**
   - Show aggregated PR count across repos
   - Repository switcher
   - Favorites/pinned repositories

5. **Rich Display**
   - PR author avatars
   - Review status indicators
   - Comments/feedback count

## Success Criteria

- [ ] Users can see open PR count at a glance
- [ ] Filters work as expected and persist
- [ ] Visual indicators clearly show PR queue state
- [ ] Performance is acceptable (<2s initial load)
- [ ] Error states are handled gracefully
- [ ] Configuration is intuitive
- [ ] Feature integrates seamlessly with existing plugin

## Dependencies

- `azure-devops-node-api` v15.1.1 (already installed)
- No additional npm packages required
- Stream Deck SDK v2 (already in use)
- Azure DevOps account with appropriate permissions

## Timeline Estimate

- **Phase 1** (Core Implementation): 2-3 days
  - Client extension and PR service
  - Basic action with count display
  - Simple Property Inspector

- **Phase 2** (Polish & Features): 1-2 days
  - All filters implemented
  - Icon design and states
  - Advanced display options

- **Phase 3** (Testing & Documentation): 1 day
  - Unit and integration tests
  - User documentation
  - Bug fixes and optimization

**Total estimate: 4-6 days**