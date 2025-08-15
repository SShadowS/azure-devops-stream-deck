# Azure DevOps Info - Stream Deck Plugin

[![CI](https://github.com/SShadowS/azure-devops-stream-deck/actions/workflows/ci.yml/badge.svg)](https://github.com/SShadowS/azure-devops-stream-deck/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/SShadowS/azure-devops-stream-deck)](https://github.com/SShadowS/azure-devops-stream-deck/releases)
[![License](https://img.shields.io/github/license/SShadowS/azure-devops-stream-deck)](LICENSE)

A comprehensive Stream Deck plugin that provides real-time monitoring and control of your Azure DevOps environment directly from your Stream Deck.

## 🎯 Current Features

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

## 🚀 Upcoming Features (In Development)

### 🔄 Work Item Status
- Track assigned work items, bugs, and tasks
- Filter by iteration, area path, or assignee
- Visual priority indicators
- Quick status updates from Stream Deck

### 📊 Sprint Progress
- Real-time sprint burndown visualization
- Story points completion tracking
- Sprint velocity metrics
- Days remaining indicator
- On-track/behind schedule alerts

### 📈 Repository Statistics
- Commit activity monitoring
- Branch count and active development tracking
- Code churn metrics
- Contributor activity overview
- Repository size and growth trends

### 🚀 Release Pipeline Monitor
- Release deployment status across environments
- Stage progression tracking
- Approval pending notifications
- Rollback capabilities
- Environment health indicators

### 🏗️ Build Queue Manager
- View queued builds
- Queue position tracking
- One-click build triggering
- Build cancellation
- Agent pool status

### 🧪 Test Results Summary
- Test run success/failure rates
- Code coverage metrics
- Failed test details
- Test duration trends
- Flaky test identification

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
│   ├── manifest.json        # Plugin metadata & actions
│   ├── bin/
│   │   └── plugin.js       # Compiled plugin (generated)
│   ├── ui/                 # Property Inspector HTML/CSS
│   │   ├── pipeline-status.html
│   │   ├── pull-request-status.html
│   │   └── *.css
│   └── imgs/               # Action icons (multiple sizes)
│       └── actions/
│           ├── pipeline-status/
│           └── pr-checks/
├── src/
│   ├── plugin.ts           # Main entry point
│   ├── actions/            # Stream Deck action handlers
│   │   ├── pipeline-status.ts
│   │   └── pr-checks.ts
│   ├── services/           # Azure DevOps API clients
│   │   ├── azure-devops-client.ts
│   │   └── pipeline-service.ts
│   └── utils/              # Helpers & utilities
│       ├── credential-manager.ts
│       └── status-display-manager.ts
├── .github/
│   └── workflows/          # CI/CD pipelines
│       └── ci.yml         # Test, build, release
└── package.json           # Dependencies & scripts
```

### Architecture

- **Actions**: Singleton pattern for managing multiple button instances
- **Services**: Abstracted Azure DevOps API interactions with caching
- **Security**: AES-256-GCM encryption for credential storage
- **Performance**: Connection pooling, request debouncing, smart caching
- **Testing**: Jest with 88% code coverage, mocked Stream Deck SDK

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
![Test Coverage](https://img.shields.io/badge/coverage-88%25-brightgreen)
![Version](https://img.shields.io/github/package-json/v/SShadowS/azure-devops-stream-deck)
![Downloads](https://img.shields.io/github/downloads/SShadowS/azure-devops-stream-deck/total)

---

<div align="center">
Made with ❤️ for the Stream Deck community
</div>