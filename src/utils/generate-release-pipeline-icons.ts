import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outputDir = path.join(__dirname, '../../com.sshadows.azure-devops-info.sdPlugin/imgs/actions/release-pipeline');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

const sizes = [
    { width: 20, height: 20, suffix: '' },
    { width: 40, height: 40, suffix: '@2x' }
];

// SVG template for release/deployment icon
const createReleaseSvg = (fillColor: string, strokeColor: string, additionalElements = '') => `
<svg width="144" height="144" viewBox="0 0 144 144" xmlns="http://www.w3.org/2000/svg">
    <!-- Background Circle -->
    <circle cx="72" cy="72" r="70" fill="${fillColor}" stroke="${strokeColor}" stroke-width="2"/>
    
    <!-- Rocket/Deploy icon -->
    <g transform="translate(52, 40)">
        <!-- Rocket body -->
        <path d="M20 10 L15 25 L15 50 L20 55 L25 50 L25 25 Z" 
              fill="white" stroke="${strokeColor}" stroke-width="2"/>
        
        <!-- Rocket nose -->
        <path d="M20 10 L15 25 L25 25 Z" 
              fill="${strokeColor}" opacity="0.7"/>
        
        <!-- Fins -->
        <path d="M15 45 L10 55 L15 50 M25 45 L30 55 L25 50" 
              stroke="${strokeColor}" stroke-width="2" fill="white"/>
        
        <!-- Window -->
        <circle cx="20" cy="30" r="3" fill="${strokeColor}"/>
        
        <!-- Flame/thrust -->
        <path d="M15 55 L17 62 L20 58 L23 62 L25 55" 
              fill="#FFA500" stroke="#FF6B35" stroke-width="1" opacity="0.8"/>
    </g>
    
    <!-- Environment dots (representing deployment stages) -->
    <g transform="translate(35, 85)">
        <circle cx="10" cy="5" r="3" fill="${strokeColor}" opacity="0.9"/>
        <line x1="13" y1="5" x2="22" y2="5" stroke="${strokeColor}" stroke-width="2" opacity="0.5"/>
        <circle cx="25" cy="5" r="3" fill="${strokeColor}" opacity="0.7"/>
        <line x1="28" y1="5" x2="37" y2="5" stroke="${strokeColor}" stroke-width="2" opacity="0.5"/>
        <circle cx="40" cy="5" r="3" fill="${strokeColor}" opacity="0.5"/>
        <line x1="43" y1="5" x2="52" y2="5" stroke="${strokeColor}" stroke-width="2" opacity="0.5"/>
        <circle cx="55" cy="5" r="3" fill="${strokeColor}" opacity="0.3"/>
        <line x1="58" y1="5" x2="67" y2="5" stroke="${strokeColor}" stroke-width="2" opacity="0.5"/>
        <circle cx="70" cy="5" r="3" fill="${strokeColor}" opacity="0.2"/>
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
        createReleaseSvg('#4A90E2', '#2C5282'),
        'icon'
    );
    
    // Success state (green - all environments deployed)
    await generateIcon(
        createReleaseSvg('#48BB78', '#276749', `
            <!-- Checkmark -->
            <path d="M95 70 L105 80 L120 60" stroke="#276749" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        `),
        'success'
    );
    
    // In Progress state (blue - deploying)
    await generateIcon(
        createReleaseSvg('#4299E1', '#2B6CB1', `
            <!-- Spinning arrows -->
            <g transform="translate(105, 70)">
                <path d="M0 -10 A 10 10 0 1 1 -7 -7" stroke="#2B6CB1" stroke-width="3" fill="none" stroke-linecap="round"/>
                <path d="M-7 -7 L-10 -10 L-7 -13" stroke="#2B6CB1" stroke-width="3" fill="none" stroke-linecap="round"/>
            </g>
        `),
        'inprogress'
    );
    
    // Failed state (red - deployment failed)
    await generateIcon(
        createReleaseSvg('#F56565', '#C53030', `
            <!-- X mark -->
            <path d="M95 60 L115 80 M115 60 L95 80" stroke="#C53030" stroke-width="4" stroke-linecap="round"/>
        `),
        'failed'
    );
    
    // Partial state (yellow/orange - some environments failed)
    await generateIcon(
        createReleaseSvg('#ECC94B', '#B7791F', `
            <!-- Warning triangle -->
            <path d="M105 58 L95 75 L115 75 Z" stroke="#B7791F" stroke-width="2" fill="none"/>
            <circle cx="105" cy="68" r="1" fill="#B7791F"/>
            <line x1="105" y1="62" x2="105" y2="65" stroke="#B7791F" stroke-width="2" stroke-linecap="round"/>
        `),
        'partial'
    );
    
    // Not Deployed state (gray - no deployments)
    await generateIcon(
        createReleaseSvg('#A0AEC0', '#718096', `
            <!-- Empty circle -->
            <circle cx="105" cy="70" r="10" stroke="#718096" stroke-width="2" fill="none" stroke-dasharray="3,3"/>
        `),
        'notdeployed'
    );
    
    // Unknown state (gray with question mark)
    await generateIcon(
        createReleaseSvg('#CBD5E0', '#718096', `
            <!-- Question mark -->
            <text x="105" y="78" font-family="Arial" font-size="20" fill="#718096" text-anchor="middle">?</text>
        `),
        'unknown'
    );
    
    console.log('All Release Pipeline icons generated successfully!');
}

generateAllIcons().catch(console.error);