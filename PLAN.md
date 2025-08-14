# Implementation Plan: Azure DevOps Pipeline Status Button

## Goal
Create a Stream Deck button that displays the current status of an Azure DevOps build pipeline with visual indicators (color, icon, text) and updates in real-time.

## Phase 1: Foundation & Testing Setup

### 1.1 Set Up Testing Infrastructure
- [ ] Install Jest and testing dependencies
  ```bash
  npm install --save-dev jest @types/jest ts-jest
  npm install --save-dev @testing-library/jest-dom
  ```
- [ ] Create `jest.config.js` for TypeScript support
- [ ] Add test scripts to `package.json`:
  ```json
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  }
  ```
- [ ] Create test structure: `src/__tests__/` and `src/actions/__tests__/`

### 1.2 Install Azure DevOps Dependencies
- [ ] Install official Azure DevOps client library:
  ```bash
  npm install azure-devops-node-api
  ```
- [ ] Install credential management:
  ```bash
  npm install @azure/identity @azure/core-auth
  ```
- [ ] Add type definitions if needed

## Phase 2: Azure DevOps Service Layer

### 2.1 Create Azure DevOps Client Service
**File:** `src/services/azure-devops-client.ts`
- [ ] Create `AzureDevOpsClient` class
- [ ] Implement authentication (PAT token support)
- [ ] Add connection validation method
- [ ] Implement error handling and retry logic

**Tests:** `src/services/__tests__/azure-devops-client.test.ts`
- [ ] Test authentication with valid/invalid tokens
- [ ] Test connection validation
- [ ] Test error handling scenarios
- [ ] Mock API responses

### 2.2 Create Pipeline Service
**File:** `src/services/pipeline-service.ts`
- [ ] Implement `getPipelineStatus()` method
- [ ] Implement `getLatestBuild()` method
- [ ] Implement `getPipelineRuns()` method
- [ ] Add status mapping (succeeded, failed, running, etc.)
- [ ] Add caching layer for API calls

**Tests:** `src/services/__tests__/pipeline-service.test.ts`
- [ ] Test pipeline status retrieval
- [ ] Test build information parsing
- [ ] Test status mapping logic
- [ ] Test caching behavior
- [ ] Test API rate limiting handling

## Phase 3: Stream Deck Action Implementation

### 3.1 Create Pipeline Status Action
**File:** `src/actions/pipeline-status.ts`
- [ ] Create `PipelineStatusAction` extending `SingletonAction`
- [ ] Define settings interface:
  ```typescript
  interface PipelineStatusSettings {
    organizationUrl: string;
    projectName: string;
    pipelineId: number;
    personalAccessToken: string;
    refreshInterval: number; // in seconds
    displayFormat: 'icon' | 'text' | 'both';
  }
  ```
- [ ] Implement `onWillAppear()` - initialize display
- [ ] Implement `onKeyDown()` - open pipeline in browser
- [ ] Implement polling mechanism for status updates
- [ ] Implement visual status indicators

**Tests:** `src/actions/__tests__/pipeline-status.test.ts`
- [ ] Test action initialization
- [ ] Test settings validation
- [ ] Test polling mechanism
- [ ] Test visual updates
- [ ] Test error states

### 3.2 Create Status Display Manager
**File:** `src/utils/status-display.ts`
- [ ] Map pipeline statuses to colors:
  - Succeeded: Green (#28a745)
  - Failed: Red (#dc3545)
  - Running: Blue (#007bff)
  - Partially Succeeded: Yellow (#ffc107)
  - Canceled: Gray (#6c757d)
- [ ] Create status icons/badges
- [ ] Format status text (build number, duration, etc.)

**Tests:** `src/utils/__tests__/status-display.test.ts`
- [ ] Test color mapping
- [ ] Test text formatting
- [ ] Test icon selection

## Phase 4: Property Inspector UI

### 4.1 Create Configuration UI
**File:** `com.sshadows.azure-devops-info.sdPlugin/ui/pipeline-status.html`
- [ ] Create form for Azure DevOps settings:
  - Organization URL input
  - Project name input
  - Pipeline ID/name selector
  - PAT token input (secure)
  - Refresh interval slider
  - Display format options
- [ ] Add connection test button
- [ ] Implement settings validation
- [ ] Add help text and links to Azure DevOps docs

### 4.2 Create UI Styling
**File:** `com.sshadows.azure-devops-info.sdPlugin/ui/css/pipeline-status.css`
- [ ] Style consistent with Stream Deck UI guidelines
- [ ] Add loading states
- [ ] Add error state styling

## Phase 5: Secure Credential Storage

### 5.1 Implement Secure Storage
**File:** `src/utils/credential-manager.ts`
- [ ] Implement encryption for PAT tokens
- [ ] Use Stream Deck's global settings for storage
- [ ] Add credential validation
- [ ] Implement token refresh mechanism

**Tests:** `src/utils/__tests__/credential-manager.test.ts`
- [ ] Test encryption/decryption
- [ ] Test storage and retrieval
- [ ] Test validation

## Phase 6: Error Handling & Logging

### 6.1 Comprehensive Error Handling
**File:** `src/utils/error-handler.ts`
- [ ] Create error types for different scenarios:
  - Authentication errors
  - Network errors
  - API rate limiting
  - Invalid configuration
- [ ] Implement user-friendly error messages
- [ ] Add retry logic with exponential backoff

### 6.2 Enhanced Logging
- [ ] Add debug logging for API calls
- [ ] Log status changes
- [ ] Add performance metrics
- [ ] Implement log rotation

## Phase 7: Integration & Polish

### 7.1 Update Plugin Manifest
**File:** `com.sshadows.azure-devops-info.sdPlugin/manifest.json`
- [ ] Add pipeline status action definition
- [ ] Add appropriate icons
- [ ] Update plugin description

### 7.2 Add Pipeline Status Icons
- [ ] Create status icons (32x32, 64x64)
- [ ] Create action icons
- [ ] Create category icon

### 7.3 Documentation
- [ ] Update README.md with setup instructions
- [ ] Create SETUP.md with Azure DevOps configuration guide
- [ ] Add troubleshooting guide
- [ ] Update CLAUDE.md with new architecture details

## Phase 8: Testing & Validation

### 8.1 Integration Tests
- [ ] Test full flow from configuration to status display
- [ ] Test with different pipeline types
- [ ] Test error recovery
- [ ] Test performance with multiple buttons

### 8.2 Manual Testing Checklist
- [ ] Test with various Azure DevOps organizations
- [ ] Test with different pipeline configurations
- [ ] Test network interruption handling
- [ ] Test Stream Deck profile switching
- [ ] Test plugin update/restart scenarios

## Phase 9: Advanced Features (Future)

### 9.1 Additional Capabilities
- [ ] Multiple pipeline monitoring
- [ ] Build history graph
- [ ] Trigger new builds from Stream Deck
- [ ] Show build artifacts
- [ ] Display test results summary
- [ ] Show deployment status
- [ ] Add webhook support for instant updates

## Technical Considerations

### API Rate Limiting
- Implement intelligent polling (increase interval on stable pipelines)
- Cache responses appropriately
- Use ETags for conditional requests

### Performance
- Minimize API calls
- Use Stream Deck's built-in caching
- Implement debouncing for rapid button presses

### Security
- Never log PAT tokens
- Encrypt stored credentials
- Validate all inputs
- Use HTTPS only
- Implement token expiration handling

## Dependencies Summary

### Production Dependencies
```json
{
  "azure-devops-node-api": "^12.x",
  "@azure/identity": "^4.x",
  "@azure/core-auth": "^1.x"
}
```

### Development Dependencies
```json
{
  "jest": "^29.x",
  "@types/jest": "^29.x",
  "ts-jest": "^29.x",
  "@testing-library/jest-dom": "^6.x"
}
```

## Success Criteria

1. **Functionality**
   - Successfully connects to Azure DevOps
   - Accurately displays pipeline status
   - Updates status at configured intervals
   - Handles errors gracefully

2. **User Experience**
   - Easy configuration through property inspector
   - Clear visual status indicators
   - Responsive to user interactions
   - Helpful error messages

3. **Code Quality**
   - >80% test coverage
   - All tests passing
   - No security vulnerabilities
   - Follows TypeScript best practices
   - Proper error handling throughout

4. **Performance**
   - Status updates within 2 seconds
   - Minimal CPU/memory usage
   - Efficient API usage

## Timeline Estimate

- Phase 1-2: 2 days (Foundation & Azure DevOps Service)
- Phase 3-4: 2 days (Stream Deck Action & UI)
- Phase 5-6: 1 day (Security & Error Handling)
- Phase 7-8: 2 days (Integration & Testing)
- **Total: ~1 week for MVP**

## Next Steps

1. Review and approve this plan
2. Set up development environment
3. Create feature branch
4. Begin with Phase 1: Testing infrastructure
5. Implement incrementally with TDD approach