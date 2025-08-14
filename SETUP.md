# Azure DevOps Stream Deck Plugin - Setup Guide

This guide will walk you through setting up the Azure DevOps Info plugin for your Stream Deck.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Azure DevOps Configuration](#azure-devops-configuration)
- [Stream Deck Setup](#stream-deck-setup)
- [Advanced Configuration](#advanced-configuration)
- [Troubleshooting](#troubleshooting)

## Prerequisites

Before you begin, ensure you have:
- Stream Deck software version 6.5 or later installed
- An Azure DevOps account with access to the pipelines you want to monitor
- Administrative or appropriate permissions in your Azure DevOps organization

## Azure DevOps Configuration

### Step 1: Locate Your Organization and Project

1. Navigate to your Azure DevOps instance
2. Note your organization URL:
   - For Azure DevOps Services: `https://dev.azure.com/{your-organization}`
   - For Azure DevOps Server: `https://{your-server}/{collection}`
3. Note your project name from the project selector

### Step 2: Find Your Pipeline ID

1. Navigate to Pipelines in your Azure DevOps project
2. Click on the pipeline you want to monitor
3. Look at the URL in your browser:
   ```
   https://dev.azure.com/{org}/{project}/_build?definitionId=123
   ```
   The number after `definitionId=` is your Pipeline ID (123 in this example)

### Step 3: Create a Personal Access Token (PAT)

1. Click on your profile picture in the top right corner
2. Select **Security** or **Personal access tokens**
3. Click **+ New Token**
4. Configure your token:

   **Basic Settings:**
   - **Name**: `Stream Deck Plugin` (or any descriptive name)
   - **Organization**: Select your organization
   - **Expiration**: 
     - Custom defined (recommended: 90-365 days)
     - Note: You'll need to renew when it expires

   **Scopes:**
   - Click **Show all scopes**
   - Under **Build**, check:
     - ✅ Read
   - Optionally, under **Project and Team**, check:
     - ✅ Read (if you want to validate project access)

5. Click **Create**
6. **IMPORTANT**: Copy the token immediately! You won't be able to see it again.
7. Store it securely (the plugin will encrypt it when saving)

### Step 4: Verify Permissions

Ensure your account or PAT has access to:
- View build pipelines
- View build history
- Read build artifacts (optional, for future features)

## Stream Deck Setup

### Step 1: Install the Plugin

#### Option A: From Release
1. Download the latest `.streamDeckPlugin` file
2. Double-click to install

#### Option B: From Source
```bash
# Clone the repository
git clone https://github.com/yourusername/azure-devops-info.git
cd azure-devops-info

# Install dependencies
npm install

# Build the plugin
npm run build

# Link to Stream Deck
streamdeck link com.sshadows.azure-devops-info.sdPlugin
```

### Step 2: Add Pipeline Status Action

1. Open Stream Deck software
2. In the actions panel on the right, search for "Azure DevOps" or "Pipeline Status"
3. Drag the **Pipeline Status** action to any button on your Stream Deck

### Step 3: Configure the Action

Click on the button you just added to open the Property Inspector:

1. **Organization URL**
   - Enter your full organization URL
   - Example: `https://dev.azure.com/continia-software`

2. **Project Name**
   - Enter the exact project name (case-sensitive)
   - Example: `Continia Software`

3. **Pipeline ID**
   - Enter the numeric Pipeline ID from Step 2 above
   - Example: `937`

4. **Personal Access Token**
   - Paste the PAT you created in Azure DevOps
   - The token will be encrypted and stored securely

5. **Display Options**
   - **Display Format**: Choose how to show the status
     - Icon only: Shows visual indicator
     - Text only: Shows status text
     - Both: Shows icon and text
   - **Show Build Number**: Display the build number
   - **Show Duration**: Display build duration
   - **Refresh Interval**: How often to check for updates (30-300 seconds)

### Step 4: Test Connection

1. Click the **Test Connection** button in the Property Inspector
2. You should see a success message if everything is configured correctly
3. The button on your Stream Deck will update with the current pipeline status

## Advanced Configuration

### Multiple Pipelines

You can monitor multiple pipelines by:
1. Adding multiple Pipeline Status actions to your Stream Deck
2. Configuring each with different Pipeline IDs
3. Using profiles to organize different projects or environments

### Status States

The plugin displays different visual states:
- **Success** (Green): Build completed successfully
- **Failed** (Red): Build failed
- **Running** (Blue): Build currently in progress
- **Partially Succeeded** (Yellow): Build completed with warnings
- **Canceled** (Gray): Build was canceled
- **Unknown** (Dark Gray): Status cannot be determined
- **Not Started** (Light Gray): No builds have run yet

### Display Customization

The button displays information in this format:
```
[Status]
[Version/Branch]
[Build Number]
[Duration]
```

Example:
```
Success
main
#1234
2h 15m
```

### Polling and Performance

- **Default Interval**: 30 seconds
- **Minimum**: 30 seconds (to avoid rate limiting)
- **Maximum**: 300 seconds (5 minutes)
- **Caching**: The plugin caches results to minimize API calls
- **Rate Limiting**: Azure DevOps allows 200 requests per user per minute

## Troubleshooting

### Common Issues

#### "Authentication Failed"
- **Cause**: Invalid or expired PAT
- **Solution**: 
  1. Create a new PAT in Azure DevOps
  2. Update the token in Property Inspector
  3. Click Test Connection

#### "Pipeline Not Found"
- **Cause**: Incorrect Pipeline ID or no access
- **Solution**:
  1. Verify the Pipeline ID from the URL
  2. Ensure your PAT has Build (read) scope
  3. Check you have access to the pipeline in Azure DevOps

#### "Network Error"
- **Cause**: Connection issues or proxy settings
- **Solution**:
  1. Check internet connectivity
  2. Verify organization URL is correct
  3. Check if behind corporate proxy (see proxy setup below)

#### Button Shows "Unknown" Status
- **Cause**: No recent builds or API error
- **Solution**:
  1. Check if pipeline has any builds
  2. Verify all settings are correct
  3. Check logs for detailed error messages

### Viewing Logs

#### Windows
```
%appdata%\Elgato\StreamDeck\logs\com.sshadows.azure-devops-info\
```

#### macOS
```
~/Library/Logs/ElgatoStreamDeck/com.sshadows.azure-devops-info/
```

Look for entries with timestamps around when the issue occurred.

### Corporate Proxy Setup

If behind a corporate proxy:

1. Set environment variables:
   ```bash
   HTTP_PROXY=http://proxy.company.com:8080
   HTTPS_PROXY=http://proxy.company.com:8080
   ```

2. For authenticated proxies:
   ```bash
   HTTPS_PROXY=http://username:password@proxy.company.com:8080
   ```

### Azure DevOps Server (On-Premises)

For on-premises Azure DevOps Server:

1. Use your server URL instead of dev.azure.com
2. Ensure the server certificate is trusted
3. May need to configure NODE_TLS_REJECT_UNAUTHORIZED=0 for self-signed certificates (not recommended for production)

## Security Best Practices

1. **Token Expiration**: Set tokens to expire and rotate regularly
2. **Minimal Scopes**: Only grant Build (read) permission
3. **Secure Storage**: Tokens are encrypted with AES-256-GCM
4. **Don't Share**: Never share your PAT or configuration
5. **Revoke Compromised Tokens**: If a token is exposed, revoke it immediately in Azure DevOps

## Getting Help

### Resources
- [Azure DevOps REST API Documentation](https://docs.microsoft.com/en-us/rest/api/azure/devops/)
- [Stream Deck SDK Documentation](https://docs.elgato.com/streamdeck/sdk/)
- [Plugin GitHub Repository](https://github.com/yourusername/azure-devops-info)

### Support Channels
- GitHub Issues: Report bugs or request features
- Stream Deck Community: General Stream Deck help
- Azure DevOps Forums: Azure DevOps specific questions

## FAQ

**Q: Can I monitor multiple organizations?**
A: Yes, add multiple buttons with different organization URLs and PATs.

**Q: How often does the status update?**
A: Based on your configured refresh interval (30-300 seconds).

**Q: Can I trigger builds from Stream Deck?**
A: Not yet, but this feature is planned for a future release.

**Q: Does it work with YAML pipelines?**
A: Yes, it works with both classic and YAML pipelines.

**Q: Can I see deployment status?**
A: Currently only build pipelines are supported. Release pipelines are planned.

**Q: Is my PAT stored securely?**
A: Yes, PATs are encrypted using AES-256-GCM before storage.