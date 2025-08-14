# Troubleshooting Guide - Azure DevOps Stream Deck Plugin

This guide helps you diagnose and resolve common issues with the Azure DevOps Info plugin.

## Table of Contents
- [Quick Diagnostics](#quick-diagnostics)
- [Common Issues and Solutions](#common-issues-and-solutions)
- [Error Messages](#error-messages)
- [Performance Issues](#performance-issues)
- [Advanced Debugging](#advanced-debugging)
- [Getting Support](#getting-support)

## Quick Diagnostics

### 1. Check Plugin Status
```bash
# Check if plugin is running
streamdeck status com.sshadows.azure-devops-info

# Restart the plugin
streamdeck restart com.sshadows.azure-devops-info

# Validate plugin structure
streamdeck validate com.sshadows.azure-devops-info.sdPlugin
```

### 2. View Recent Logs

#### Windows (PowerShell)
```powershell
Get-Content "$env:APPDATA\Elgato\StreamDeck\Plugins\com.sshadows.azure-devops-info.sdPlugin\logs\com.sshadows.azure-devops-info.0.log" -Tail 50
```

#### macOS/Linux
```bash
tail -50 ~/Library/Logs/ElgatoStreamDeck/com.sshadows.azure-devops-info.0.log
```

### 3. Test Azure DevOps Connection
Use the "Test Connection" button in the Property Inspector to verify:
- Organization URL is correct
- PAT token is valid
- Network connectivity is working
- API permissions are sufficient

## Common Issues and Solutions

### Issue: Button Shows "Unknown" Status

**Symptoms:**
- Button displays "Unknown" state
- No build information shown
- Status doesn't update

**Possible Causes & Solutions:**

1. **No Recent Builds**
   - Check if the pipeline has any recent builds in Azure DevOps
   - Trigger a manual build to test
   - If using branch filtering, ensure builds exist for the specified branch

2. **Incorrect Pipeline ID**
   - Verify the Pipeline ID in the Property Inspector
   - Get the correct ID from the Azure DevOps URL: `definitionId=XXX`

3. **Branch Filter Issues**
   - Verify the branch name is correct (e.g., 'main', 'develop')
   - Try both short format ('main') and full format ('refs/heads/main')
   - Check if builds exist for the specified branch
   - Leave branch field empty to monitor all branches

4. **API Error**
   - Check logs for specific error messages
   - Look for HTTP status codes (401, 403, 404, etc.)

### Issue: Authentication Failed

**Symptoms:**
- Error message: "Authentication failed"
- HTTP 401 or 403 errors in logs
- Test Connection fails

**Solutions:**

1. **Invalid or Expired PAT**
   ```
   Solution: Create a new PAT in Azure DevOps
   1. Go to User Settings → Personal Access Tokens
   2. Create new token with Build (read) scope
   3. Update token in Property Inspector
   ```

2. **Incorrect Organization URL**
   ```
   Correct format: https://dev.azure.com/yourorg
   Wrong formats:
   - https://dev.azure.com/yourorg/project (includes project)
   - https://yourorg.visualstudio.com (old format)
   - yourorg (missing protocol and domain)
   ```

3. **Insufficient Permissions**
   - Ensure PAT has "Build" → "Read" permission
   - Verify you have access to the specific pipeline

### Issue: Pipeline Not Found

**Symptoms:**
- Error: "Pipeline not found"
- HTTP 404 errors
- Button doesn't update

**Solutions:**

1. **Wrong Pipeline ID**
   - Navigate to your pipeline in Azure DevOps
   - Check URL for `definitionId=XXX`
   - Use the numeric ID, not the pipeline name

2. **Wrong Project Name**
   - Verify exact project name (case-sensitive)
   - Don't include organization name in project field

3. **Access Restrictions**
   - Ensure your account has access to the pipeline
   - Check if pipeline is in a different project

### Issue: No Updates/Refreshing

**Symptoms:**
- Status stays the same
- Old build information displayed
- No periodic updates

**Solutions:**

1. **Check Refresh Interval**
   - Minimum: 30 seconds
   - Maximum: 300 seconds (5 minutes)
   - Increase if experiencing rate limiting

2. **Caching Issues**
   - Plugin caches results for efficiency
   - Restart plugin to clear cache:
   ```bash
   streamdeck restart com.sshadows.azure-devops-info
   ```

3. **Network Issues**
   - Check internet connectivity
   - Verify no firewall blocking
   - Check proxy settings if applicable

## Error Messages

### "Rate limit exceeded"
**Meaning:** Too many API requests to Azure DevOps

**Solution:**
- Increase refresh interval (60+ seconds)
- Reduce number of pipeline buttons
- Wait for rate limit to reset (usually 1 minute)

### "Network error"
**Meaning:** Cannot connect to Azure DevOps

**Solution:**
- Check internet connection
- Verify organization URL
- Check proxy/firewall settings
- Try accessing Azure DevOps in browser

### "Invalid configuration"
**Meaning:** Required settings are missing or invalid

**Solution:**
- Fill in all required fields in Property Inspector
- Verify formats are correct
- Save settings and restart plugin

### "Token expired"
**Meaning:** PAT has expired

**Solution:**
- Create new PAT in Azure DevOps
- Update in Property Inspector
- Consider longer expiration period

## Performance Issues

### High CPU Usage

**Symptoms:**
- Stream Deck software using excessive CPU
- System slowdown
- Fan noise increase

**Solutions:**
1. Increase refresh interval (60-300 seconds)
2. Reduce number of pipeline monitors
3. Check for error loops in logs
4. Restart Stream Deck software

### Memory Leaks

**Symptoms:**
- Memory usage increases over time
- Stream Deck becomes unresponsive
- Need to restart frequently

**Solutions:**
1. Update to latest plugin version
2. Report issue with logs on GitHub
3. Restart plugin periodically as workaround

### Slow Updates

**Symptoms:**
- Long delay between status changes
- Button freezes temporarily
- Laggy response to clicks

**Solutions:**
1. Check network latency to Azure DevOps
2. Reduce refresh interval load
3. Check for API throttling in logs

## Advanced Debugging

### Enable Verbose Logging

1. Locate plugin installation:
   - Windows: `%appdata%\Elgato\StreamDeck\Plugins\com.sshadows.azure-devops-info.sdPlugin\`
   - macOS: `~/Library/Application Support/com.elgato.StreamDeck/Plugins/com.sshadows.azure-devops-info.sdPlugin/`

2. The plugin already uses TRACE level logging by default

### Use Stream Deck Developer Tools

1. Open Chrome/Edge browser
2. Navigate to: `http://localhost:23654/`
3. Find your plugin instance
4. Open Inspector to view:
   - Console logs
   - Network requests
   - Property Inspector communication

### Analyze Network Traffic

Use browser developer tools or Fiddler to inspect:
- API requests to Azure DevOps
- Response status codes
- Response payload
- Request headers (hide PAT!)

### Common Log Patterns

**Successful Connection:**
```
DEBUG AzureDevOpsClient: Connection validated. Found X build(s)
INFO  AzureDevOpsClient: Successfully connected to Azure DevOps
```

**Failed Authentication:**
```
ERROR AzureDevOpsClient: Authentication failed: 401
ERROR PipelineStatusAction: Failed to update status: Authentication failed
```

**Rate Limiting:**
```
WARN  ErrorHandler: Rate limit exceeded. Retry after 60 seconds
DEBUG ErrorHandler: Retrying after 60000ms (attempt 1/3)
```

## Corporate Environment Issues

### Behind Proxy

Set environment variables:
```bash
# Windows (Command Prompt)
set HTTP_PROXY=http://proxy.company.com:8080
set HTTPS_PROXY=http://proxy.company.com:8080

# Windows (PowerShell)
$env:HTTP_PROXY="http://proxy.company.com:8080"
$env:HTTPS_PROXY="http://proxy.company.com:8080"

# macOS/Linux
export HTTP_PROXY=http://proxy.company.com:8080
export HTTPS_PROXY=http://proxy.company.com:8080
```

### Self-Signed Certificates

For Azure DevOps Server with self-signed certificates:

**Warning:** Only for development/testing
```bash
set NODE_TLS_REJECT_UNAUTHORIZED=0
```

Better solution: Add certificate to trusted store

### Firewall Rules

Ensure these are allowed:
- HTTPS (443) to `dev.azure.com`
- HTTPS (443) to your Azure DevOps Server
- WebSocket connections for Stream Deck

## Plugin-Specific Issues

### Icons Not Displaying

**Solutions:**
1. Verify icon files exist in `imgs/actions/pipeline-status/`
2. Check manifest.json references correct paths
3. Rebuild plugin: `npm run build`
4. Reinstall plugin

### Property Inspector Not Loading

**Solutions:**
1. Check `ui/pipeline-status.html` exists
2. Verify no JavaScript errors in DevTools
3. Clear Stream Deck cache and restart
4. Check manifest.json PropertyInspectorPath

### Settings Not Saving

**Solutions:**
1. Check write permissions on settings file
2. Verify JSON formatting in Property Inspector
3. Look for errors in console logs
4. Try removing and re-adding action

## Getting Support

### Before Reporting an Issue

1. **Collect Information:**
   - Plugin version (from manifest.json)
   - Stream Deck version
   - Operating system and version
   - Azure DevOps type (Services/Server)
   
2. **Gather Logs:**
   - Last 100 lines of plugin log
   - Any error messages
   - Screenshots if UI-related

3. **Test Minimal Setup:**
   - Try with single pipeline
   - Use fresh PAT token
   - Test in new Stream Deck profile

### Where to Get Help

1. **GitHub Issues**
   - Search existing issues first
   - Create new issue with template
   - Include all diagnostic information

2. **Stream Deck Community**
   - General Stream Deck questions
   - Plugin development help

3. **Azure DevOps Forums**
   - API-specific questions
   - Permission and access issues

### Reporting Security Issues

For security vulnerabilities:
- Do NOT create public GitHub issue
- Email security concerns privately
- Include steps to reproduce
- Allow time for patch before disclosure

## Quick Reference

### File Locations

**Windows:**
- Plugin: `%appdata%\Elgato\StreamDeck\Plugins\com.sshadows.azure-devops-info.sdPlugin\`
- Logs: `%appdata%\Elgato\StreamDeck\Plugins\com.sshadows.azure-devops-info.sdPlugin\logs\`
- Settings: `%appdata%\Elgato\StreamDeck\ProfilesV2\`

**macOS:**
- Plugin: `~/Library/Application Support/com.elgato.StreamDeck/Plugins/`
- Logs: `~/Library/Logs/ElgatoStreamDeck/`
- Settings: `~/Library/Application Support/com.elgato.StreamDeck/ProfilesV2/`

### Useful Commands

```bash
# Restart plugin
streamdeck restart com.sshadows.azure-devops-info

# Validate structure
streamdeck validate com.sshadows.azure-devops-info.sdPlugin

# View logs (Windows)
type com.sshadows.azure-devops-info.sdPlugin\logs\*.log

# View logs (macOS/Linux)
tail -f ~/Library/Logs/ElgatoStreamDeck/*.log

# Rebuild plugin
npm run build

# Run tests
npm test
```

### Status Codes Reference

- **200**: Success
- **401**: Unauthorized (bad token)
- **403**: Forbidden (no access)
- **404**: Not found (wrong ID/URL)
- **429**: Rate limited
- **500**: Server error
- **503**: Service unavailable