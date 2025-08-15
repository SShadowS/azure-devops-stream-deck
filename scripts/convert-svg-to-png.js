import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const iconsDir = path.join(__dirname, '..', 'com.sshadows.azure-devops-info.sdPlugin', 'imgs', 'actions', 'pull-request-status');

const svgFiles = [
    'icon.svg',
    'none.svg',
    'few.svg',
    'many.svg',
    'critical.svg'
];

async function convertSvgToPng() {
    for (const svgFile of svgFiles) {
        const svgPath = path.join(iconsDir, svgFile);
        const pngName = svgFile.replace('.svg', '.png');
        const png2xName = svgFile.replace('.svg', '@2x.png');
        const pngPath = path.join(iconsDir, pngName);
        const png2xPath = path.join(iconsDir, png2xName);
        
        if (!fs.existsSync(svgPath)) {
            console.log(`Skipping ${svgFile} - file not found`);
            continue;
        }
        
        try {
            // Read SVG file
            const svgBuffer = fs.readFileSync(svgPath);
            
            // Convert to 72x72 PNG (1x)
            await sharp(svgBuffer)
                .resize(72, 72)
                .png()
                .toFile(pngPath);
            console.log(`Created ${pngName}`);
            
            // Convert to 144x144 PNG (2x)
            await sharp(svgBuffer)
                .resize(144, 144)
                .png()
                .toFile(png2xPath);
            console.log(`Created ${png2xName}`);
            
        } catch (error) {
            console.error(`Error converting ${svgFile}:`, error);
        }
    }
}

convertSvgToPng().then(() => {
    console.log('Icon conversion complete!');
}).catch(error => {
    console.error('Conversion failed:', error);
});