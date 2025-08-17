import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outputDir = path.join(__dirname, '../../com.sshadows.azure-devops-info.sdPlugin/imgs/actions/repository-stats');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

const sizes = [
    { width: 20, height: 20, suffix: '' },
    { width: 40, height: 40, suffix: '@2x' }
];

// SVG template for repository icon
const createRepositorySvg = (fillColor: string, strokeColor: string, additionalElements = '') => `
<svg width="144" height="144" viewBox="0 0 144 144" xmlns="http://www.w3.org/2000/svg">
    <!-- Background Circle -->
    <circle cx="72" cy="72" r="70" fill="${fillColor}" stroke="${strokeColor}" stroke-width="2"/>
    
    <!-- Repository icon (folder with Git branch) -->
    <g transform="translate(36, 36)">
        <!-- Folder shape -->
        <path d="M10 20 L10 15 L15 10 L35 10 L40 15 L60 15 L65 20 L65 60 L10 60 Z" 
              fill="white" stroke="${strokeColor}" stroke-width="2" opacity="0.9"/>
        
        <!-- Git branch symbol -->
        <g transform="translate(20, 25)">
            <circle cx="5" cy="15" r="4" fill="${strokeColor}"/>
            <circle cx="20" cy="5" r="4" fill="${strokeColor}"/>
            <circle cx="20" cy="25" r="4" fill="${strokeColor}"/>
            <path d="M5 15 L20 5 M5 15 L20 25" stroke="${strokeColor}" stroke-width="2" fill="none"/>
        </g>
    </g>
    
    ${additionalElements}
</svg>
`;

// Generate icon state
async function generateIcon(svgContent: string, baseName: string) {
    for (const size of sizes) {
        const outputPath = path.join(outputDir, `${baseName}${size.suffix}.png`);
        
        await sharp(Buffer.from(svgContent))
            .resize(size.width, size.height)
            .png()
            .toFile(outputPath);
        
        console.log(`Generated: ${outputPath}`);
    }
}

// Generate all icon states
async function generateAllIcons() {
    // Base icon
    await generateIcon(
        createRepositorySvg('#4A90E2', '#2C5282'),
        'icon'
    );
    
    // Active state (green - increasing activity)
    await generateIcon(
        createRepositorySvg('#48BB78', '#276749', `
            <!-- Up arrow indicator -->
            <path d="M100 100 L110 85 L120 100" stroke="#276749" stroke-width="3" fill="none" stroke-linecap="round"/>
        `),
        'active'
    );
    
    // Stable state (blue - normal activity)
    await generateIcon(
        createRepositorySvg('#4299E1', '#2B6CB1', `
            <!-- Horizontal line indicator -->
            <line x1="100" y1="95" x2="120" y2="95" stroke="#2B6CB1" stroke-width="3" stroke-linecap="round"/>
        `),
        'stable'
    );
    
    // Decreasing state (yellow - low activity)
    await generateIcon(
        createRepositorySvg('#ECC94B', '#B7791F', `
            <!-- Down arrow indicator -->
            <path d="M100 85 L110 100 L120 85" stroke="#B7791F" stroke-width="3" fill="none" stroke-linecap="round"/>
        `),
        'decreasing'
    );
    
    console.log('All Repository Stats icons generated successfully!');
}

generateAllIcons().catch(console.error);