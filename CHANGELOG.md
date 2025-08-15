# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Automatic semantic versioning and release creation
- GitHub Actions workflow for packaging Stream Deck plugin
- Automatic .streamDeckPlugin creation on master commits

### Changed
- CI workflow now creates GitHub releases with versioned plugin files

## [1.0.0] - Initial Release

### Added
- Azure DevOps pipeline status monitoring
- Pull request status tracking
- Real-time status updates
- Secure credential storage with AES-256-GCM encryption
- Branch filtering for pipeline monitoring
- Automatic retry logic with exponential backoff
- Comprehensive error handling