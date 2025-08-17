# Azure DevOps Info - Stream Deck Plugin

[![CI](https://github.com/SShadowS/azure-devops-stream-deck/actions/workflows/ci.yml/badge.svg)](https://github.com/SShadowS/azure-devops-stream-deck/actions/workflows/ci.yml)
[![Test Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen)](https://github.com/SShadowS/azure-devops-stream-deck)
[![Release](https://img.shields.io/github/v/release/SShadowS/azure-devops-stream-deck)](https://github.com/SShadowS/azure-devops-stream-deck/releases)
[![License](https://img.shields.io/github/license/SShadowS/azure-devops-stream-deck)](LICENSE)

A comprehensive Stream Deck plugin that provides real-time monitoring and control of your Azure DevOps environment directly from your Stream Deck. Now featuring 10 powerful actions for complete DevOps visibility!

## ✨ Key Features

- **10 Powerful Actions**: Complete Azure DevOps monitoring suite
- **Real-time Updates**: Live status updates with configurable refresh intervals
- **Profile Management**: Manage multiple Azure DevOps organizations
- **Secure Storage**: AES-256-GCM encryption for all credentials
- **Visual Indicators**: Color-coded states for instant status recognition
- **One-Click Actions**: Execute DevOps operations directly from Stream Deck
- **Smart Caching**: Optimized API usage with intelligent caching
- **100% Test Coverage**: Thoroughly tested with 1043 passing tests

## 🆕 Version 2.0 - Profile-Based Configuration

The plugin now features a powerful profile-based configuration system:
- **Multiple Profiles**: Manage multiple Azure DevOps organizations and projects
- **Centralized Management**: Configure credentials once, use everywhere
- **Quick Switching**: Easily switch between different environments
- **Secure Storage**: All credentials are encrypted using AES-256-GCM
- **Import/Export**: Share configurations with your team (without sensitive data)

See the [Profile Configuration Guide](docs/PROFILE_CONFIGURATION_GUIDE.md) for detailed setup instructions.

## 🎯 Current Features

### ✅ Configuration Manager
- **Profile Management**: Create and manage multiple Azure DevOps configurations
- **Centralized Credentials**: Store credentials once, use across all actions
- **Connection Testing**: Verify connections before saving
- **Profile Import/Export**: Share configurations with team members
- **Profile Duplication**: Quickly create similar configurations
- **Default Profile**: Set a default profile for new actions

### ✅ Pipeline Status Monitor
- **Real-time Build Status**: View the current status of your Azure DevOps pipelines
- **Branch Filtering**: Monitor specific branches (main, develop, feature branches) or all branches
- **Visual Indicators**: Color-coded states for Success (green), Failed (red), Running (blue), Partial (yellow), Canceled (gray)
- **Build Details**: Shows build number, version, duration, and last run time
- **One-Click Access**: Press to open pipeline directly in Azure DevOps
- **Auto-refresh**: Configurable intervals from 30 seconds to 5 minutes
- **Smart Caching**: Minimizes API calls with intelligent result caching

### ✅ Pull Request Monitor
- **PR Status Tracking**: Monitor open, active, and draft pull requests
- **Multi-Repository Support**: Track PRs across all or specific repositories
- **Advanced Filtering**:
  - By status (Active, Draft, Completed, Abandoned)
  - By target branch
  - By creator or reviewer
  - By age (days since creation)
- **Visual Metrics**: Shows PR count, age, and merge conflicts
- **Review Status**: See approval status and required reviewers
- **Quick Navigation**: Click to open PR list in browser

### ✅ Work Item Status
- **Real-time Tracking**: Monitor assigned work items, bugs, and tasks
- **Advanced Filtering**: By iteration, area path, assignee, or state
- **Visual Priority**: Color-coded priority indicators
- **Quick Updates**: Update work item status directly from Stream Deck
- **Smart Grouping**: Group by type, state, or assignee

### ✅ Sprint Progress
- **Sprint Burndown**: Real-time visualization of sprint progress
- **Story Points**: Track completion percentage and velocity
- **Sprint Metrics**: Current velocity vs. average velocity
- **Time Tracking**: Days remaining with on-track/behind indicators
- **Alert System**: Automatic alerts when sprint is at risk

### ✅ Repository Statistics
- **Commit Activity**: Monitor recent commits and trending activity
- **Branch Management**: Track active branches and PR readiness
- **Code Metrics**: Lines of code, churn rate, and growth trends
- **Contributor Insights**: See who's actively contributing
- **Repository Health**: Size, last activity, and maintenance indicators

### ✅ Release Pipeline Monitor
- **Multi-Environment**: Track deployments across all environments
- **Stage Progression**: Visual stage-by-stage deployment status
- **Approval Tracking**: See pending approvals and approvers
- **Deployment History**: Recent deployments with success rates
- **Quick Actions**: Approve, reject, or redeploy from Stream Deck

### ✅ Build Queue Manager
- **Queue Visibility**: See all queued and running builds
- **Agent Pool Status**: Available vs. busy agents
- **Queue Position**: Your build's position in the queue
- **Build Control**: Queue new builds or cancel existing ones
- **Wait Time Estimates**: Predicted wait times based on current queue

### ✅ Test Results Summary
- **Test Metrics**: Pass/fail rates with trend analysis
- **Coverage Tracking**: Code coverage percentage and trends
- **Failed Test Details**: Quick access to failing test names
- **Performance Metrics**: Test execution duration trends
- **Flaky Test Detection**: Identify unreliable tests automatically

## Requirements

- Stream Deck 6.5 or later
- Windows 10+ or macOS 12+
- Azure DevOps account with appropriate permissions
- Personal Access Token (PAT) with Build (read) permissions

## 📦 Installation

### Automatic Installation (Recommended)
1. Download the latest `.streamDeckPlugin` file from the [Releases](https://github.com/SShadowS/azure-devops-stream-deck/releases) page
2. Double-click the downloaded file to install it in Stream Deck
3. The plugin will appear in your Stream Deck application automatically

### Manual Installation from Source
```bash
# Clone the repository
git clone https://github.com/SShadowS/azure-devops-stream-deck.git
cd azure-devops-stream-deck

# Install dependencies
npm install

# Build the plugin
npm run build

# Link to Stream Deck (for development)
streamdeck link com.sshadows.azure-devops-info.sdPlugin

# Or create a packaged plugin
streamdeck pack com.sshadows.azure-devops-info.sdPlugin
```

## ⚙️ Configuration

### Setting up Pipeline Status Monitor

1. **Add the action to your Stream Deck**
   - Open Stream Deck software
   - Search for "Pipeline Status" in the actions list
   - Drag it to a button on your Stream Deck

2. **Configure Azure DevOps connection**
   - Click on the button to open Property Inspector
   - Enter your settings:
     - **Organization URL**: `https://dev.azure.com/yourorg`
     - **Project Name**: Your Azure DevOps project
     - **Pipeline ID**: Numeric ID (found in pipeline URL)
     - **Branch Name** (Optional): Specific branch to monitor
     - **Personal Access Token**: Your PAT (see below)
     - **Refresh Interval**: 30-300 seconds

3. **Test and verify**
   - Click "Test Connection" to validate settings
   - Button will display current pipeline status

### Setting up Pull Request Monitor

1. **Add PR Checks action to Stream Deck**
2. **Configure in Property Inspector**:
   - Azure DevOps credentials (same as pipeline)
   - Repository filter (all or specific)
   - PR status filter (Active, Draft, etc.)
   - Optional: Branch, creator, reviewer filters
3. **Button shows PR count and status**

## 🔑 Creating a Personal Access Token

1. Sign in to your Azure DevOps organization
2. Click on your profile picture → **Security** → **Personal access tokens**
3. Click **"New Token"**
4. Configure the token:
   - **Name**: `Stream Deck Plugin`
   - **Organization**: Select your organization
   - **Expiration**: Set as needed (up to 1 year)
   - **Scopes**: 
     - ✅ Build → Read
     - ✅ Code → Read (for PR monitoring)
     - ✅ Work Items → Read (for upcoming features)
5. Click **"Create"** and copy the token immediately
6. Store it securely - you won't be able to see it again!

## 👩‍💻 Development

### Prerequisites
- Node.js 20+
- npm 10+
- Stream Deck SDK CLI: `npm install -g @elgato/cli`
- Azure DevOps account with PAT

### Quick Start
```bash
# Clone and setup
git clone https://github.com/SShadowS/azure-devops-stream-deck.git
cd azure-devops-stream-deck
npm install

# Development (with auto-reload)
npm run watch

# Testing
npm test                  # Run tests
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report

# Build & Package
npm run build            # Build plugin
streamdeck pack com.sshadows.azure-devops-info.sdPlugin  # Create .streamDeckPlugin
```

### Project Structure
```
azure-devops-stream-deck/
├── com.sshadows.azure-devops-info.sdPlugin/
│   ├── manifest.json        # Plugin metadata & 10 actions
│   ├── bin/
│   │   └── plugin.js       # Compiled plugin (generated)
│   ├── ui/                 # Property Inspector HTML (10 actions)
│   │   ├── pipeline-status.html
│   │   ├── pr-checks.html
│   │   ├── work-item-status.html
│   │   ├── sprint-progress.html
│   │   ├── repository-stats.html
│   │   ├── release-pipeline.html
│   │   ├── build-queue.html
│   │   ├── test-results-summary.html
│   │   └── configuration-manager.html
│   └── imgs/               # Action icons (multiple sizes)
│       └── actions/        # Icons for all 10 actions
├── src/
│   ├── plugin.ts           # Main entry point
│   ├── interfaces/         # TypeScript interfaces for DI
│   ├── actions/            # Stream Deck action handlers (10)
│   │   ├── pipeline-status.ts
│   │   ├── pr-checks.ts
│   │   ├── work-item-status.ts
│   │   ├── sprint-progress.ts
│   │   ├── repository-stats.ts
│   │   ├── release-pipeline-monitor.ts
│   │   ├── build-queue-manager.ts
│   │   ├── test-results-summary.ts
│   │   └── configuration-manager.ts
│   ├── services/           # Azure DevOps API services
│   │   ├── azure-devops-client.ts
│   │   ├── pipeline-service.ts
│   │   ├── pull-request-service.ts
│   │   ├── work-item-service.ts
│   │   ├── sprint-service.ts
│   │   ├── repository-stats-service.ts
│   │   ├── release-pipeline-service.ts
│   │   ├── build-queue-service.ts
│   │   ├── test-results-service.ts
│   │   └── profile-manager.ts
│   ├── utils/              # Helpers & utilities
│   │   ├── credential-manager.ts
│   │   ├── action-state-manager.ts
│   │   ├── settings-manager.ts
│   │   └── error-handler.ts
│   └── test-helpers/       # Testing utilities
├── .github/
│   └── workflows/          # CI/CD pipelines
│       └── ci.yml         # Test, build, release
└── package.json           # Dependencies & scripts
```

### Architecture

- **SOLID Principles**: Full implementation of SOLID design principles for maintainability
- **Dependency Injection**: Constructor-based DI for improved testability and flexibility
- **Actions**: Singleton pattern for managing multiple button instances
- **Services**: Abstracted Azure DevOps API interactions with intelligent caching
- **Security**: AES-256-GCM encryption for credential storage
- **Performance**: Connection pooling, request debouncing, smart caching, memory optimization
- **Testing**: Jest with 100% test pass rate (1043 tests), comprehensive mocking
- **Error Handling**: Robust error recovery with exponential backoff and retry logic
- **State Management**: Centralized state management with ActionStateManager

## 🐛 Troubleshooting

### Common Issues

#### Authentication Failed
- ✅ Verify PAT hasn't expired
- ✅ Check token has required permissions (Build: Read, Code: Read)
- ✅ Confirm organization URL format: `https://dev.azure.com/yourorg`
- ✅ Ensure project name matches exactly (case-sensitive)

#### Pipeline Not Found
- ✅ Use numeric Pipeline ID from URL (e.g., `123` from `.../pipelines/123`)
- ✅ Verify you have access to the pipeline
- ✅ Check project name spelling

#### No Updates / Connection Issues
- ✅ Check logs: 
  - Windows: `%appdata%\Elgato\StreamDeck\logs\`
  - macOS: `~/Library/Logs/ElgatoStreamDeck/`
- ✅ Verify network/proxy settings
- ✅ Increase refresh interval if rate-limited
- ✅ Try "Test Connection" button

#### High CPU Usage
- Increase refresh interval (60+ seconds recommended)
- Check for multiple instances monitoring same pipeline
- Verify no connection errors causing retry loops

### Debug Mode
Enable detailed logging by editing `src/plugin.ts`:
```typescript
streamDeck.logger.setLevel(LogLevel.TRACE);
```

## 🔒 Security

- **Encryption**: PATs encrypted with AES-256-GCM
- **Storage**: Credentials stored in Stream Deck's secure settings
- **Transmission**: Direct HTTPS to Azure DevOps only
- **Logging**: Tokens never logged or exposed
- **Expiration**: Automatic detection and user notification
- **Best Practices**: 
  - Use minimum required permissions
  - Rotate tokens regularly
  - Set appropriate expiration dates

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Process
1. Fork the repository
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and test thoroughly
4. Commit using conventional commits:
   - `feat:` New feature
   - `fix:` Bug fix
   - `docs:` Documentation changes
   - `test:` Test additions/changes
   - `refactor:` Code refactoring
5. Push to your fork: `git push origin feature/amazing-feature`
6. Open a Pull Request

### Commit Guidelines
We use [Conventional Commits](https://www.conventionalcommits.org/) for automatic versioning:
- `fix: correct pipeline status color` → Patch release (1.0.1)
- `feat: add work item tracking` → Minor release (1.1.0)
- `feat!: redesign API` or `BREAKING CHANGE:` → Major release (2.0.0)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Elgato Stream Deck SDK v2](https://docs.elgato.com/streamdeck/sdk/)
- Powered by [Azure DevOps Node API](https://github.com/microsoft/azure-devops-node-api)
- Icons and UI components from Stream Deck SDK
- Community feedback and contributions

## 📬 Support

- **Issues & Bugs**: [GitHub Issues](https://github.com/SShadowS/azure-devops-stream-deck/issues)
- **Discussions**: [GitHub Discussions](https://github.com/SShadowS/azure-devops-stream-deck/discussions)
- **Latest Releases**: [GitHub Releases](https://github.com/SShadowS/azure-devops-stream-deck/releases)

## 🚦 Project Status

![Build Status](https://github.com/SShadowS/azure-devops-stream-deck/actions/workflows/ci.yml/badge.svg)
![Test Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen)
![Tests](https://img.shields.io/badge/tests-1043%20passing-brightgreen)
![Actions](https://img.shields.io/badge/actions-10-blue)
![Version](https://img.shields.io/github/package-json/v/SShadowS/azure-devops-stream-deck)
![Downloads](https://img.shields.io/github/downloads/SShadowS/azure-devops-stream-deck/total)

---

<div align="center">
Made with ❤️ for the Stream Deck community
</div>