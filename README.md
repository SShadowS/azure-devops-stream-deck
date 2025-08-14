# Azure DevOps Info - Stream Deck Plugin

A Stream Deck plugin that displays real-time Azure DevOps pipeline status and build information directly on your Stream Deck buttons.

## Features

- **Real-time Pipeline Status Monitoring**: View the current status of your Azure DevOps build pipelines
- **Branch Filtering**: Monitor specific branches (e.g., main, develop) or all branches
- **Visual Status Indicators**: Different colors and states for Success, Failed, Running, Partially Succeeded, Canceled, and Unknown states
- **Build Information Display**: Shows build number, version, and duration
- **Secure Credential Storage**: Personal Access Tokens are encrypted using AES-256-GCM
- **Automatic Updates**: Configurable refresh intervals (30 seconds to 5 minutes)
- **Click to Open**: Press the button to open the pipeline directly in Azure DevOps

## Requirements

- Stream Deck 6.5 or later
- Windows 10+ or macOS 12+
- Azure DevOps account with appropriate permissions
- Personal Access Token (PAT) with Build (read) permissions

## Installation

### From Release
1. Download the latest `.streamDeckPlugin` file from the [Releases](https://github.com/SShadowS/azure-devops-stream-deck/releases) page
2. Double-click the downloaded file to install it in Stream Deck

### From Source
1. Clone this repository
2. Install dependencies: `npm install`
3. Build the plugin: `npm run build`
4. Install using Stream Deck CLI: `streamdeck link com.sshadows.azure-devops-info.sdPlugin`

## Setup

1. **Add the Pipeline Status action to your Stream Deck**
   - Open Stream Deck software
   - Search for "Pipeline Status" in the actions list
   - Drag it to a button on your Stream Deck

2. **Configure Azure DevOps Settings**
   - Click on the button in Stream Deck software to open the Property Inspector
   - Enter your Azure DevOps configuration:
     - **Organization URL**: Your Azure DevOps organization URL (e.g., `https://dev.azure.com/yourorg`)
     - **Project Name**: The name of your Azure DevOps project
     - **Pipeline ID**: The numeric ID of the pipeline to monitor
     - **Branch Name** (Optional): Filter builds by specific branch (e.g., 'main', 'develop', 'refs/heads/feature/xyz')
     - **Personal Access Token**: Your Azure DevOps PAT (see below for instructions)
     - **Refresh Interval**: How often to check for updates (30-300 seconds)

3. **Test Connection**
   - Click "Test Connection" to verify your settings
   - The button will show the current pipeline status once connected

## Creating a Personal Access Token

1. Sign in to your Azure DevOps organization
2. Click on your profile picture → Security → Personal access tokens
3. Click "New Token"
4. Configure the token:
   - **Name**: Stream Deck Plugin (or any descriptive name)
   - **Organization**: Select your organization
   - **Expiration**: Set as needed (up to 1 year)
   - **Scopes**: Select "Build" → "Read"
5. Click "Create" and copy the token immediately (you won't be able to see it again)

## Development

### Prerequisites
- Node.js 20+
- npm or yarn
- Stream Deck SDK CLI (`npm install -g @elgato/cli`)

### Commands
```bash
# Install dependencies
npm install

# Build the plugin
npm run build

# Watch mode (auto-rebuilds and restarts plugin)
npm run watch

# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

### Project Structure
```
├── com.sshadows.azure-devops-info.sdPlugin/  # Plugin package
│   ├── manifest.json                         # Plugin configuration
│   ├── bin/plugin.js                         # Compiled plugin code
│   ├── ui/                                   # Property Inspector UI
│   └── imgs/                                  # Icons and images
├── src/                                       # Source code
│   ├── actions/                              # Stream Deck actions
│   ├── services/                             # Azure DevOps services
│   └── utils/                                # Utility functions
└── tests/                                     # Test files
```

## Troubleshooting

### Connection Issues
- **Error: Authentication failed**
  - Verify your Personal Access Token is correct and hasn't expired
  - Ensure the token has Build (read) permissions
  - Check that the organization URL and project name are correct

- **Error: Pipeline not found**
  - Verify the Pipeline ID is correct (numeric ID, not name)
  - Ensure you have access to the pipeline in Azure DevOps

- **No updates appearing**
  - Check the refresh interval isn't set too high
  - Verify network connectivity
  - Check Stream Deck logs: `%appdata%\Elgato\StreamDeck\logs\` (Windows) or `~/Library/Logs/ElgatoStreamDeck/` (macOS)

### Performance
- If experiencing high CPU usage, increase the refresh interval
- The plugin uses intelligent caching to minimize API calls

## Security

- Personal Access Tokens are encrypted using AES-256-GCM before storage
- Tokens are never logged or transmitted except to Azure DevOps
- Credentials are stored in Stream Deck's secure global settings
- Token expiration is monitored and users are notified when renewal is needed

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [Elgato Stream Deck SDK](https://docs.elgato.com/streamdeck/sdk/)
- Uses [Azure DevOps Node API](https://github.com/microsoft/azure-devops-node-api)

## Support

For issues, questions, or suggestions, please [open an issue](https://github.com/yourusername/azure-devops-info/issues) on GitHub.