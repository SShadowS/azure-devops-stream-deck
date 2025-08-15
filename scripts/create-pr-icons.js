const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

// Helper to create an icon
function createIcon(size, color, type) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    
    // Fill background
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, size, size);
    
    // Draw PR symbol (merge arrow)
    ctx.strokeStyle = 'white';
    ctx.lineWidth = size / 18;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Main vertical line
    ctx.beginPath();
    ctx.moveTo(size * 0.5, size * 0.25);
    ctx.lineTo(size * 0.5, size * 0.6);
    ctx.stroke();
    
    // Branch arrow
    ctx.beginPath();
    ctx.moveTo(size * 0.35, size * 0.35);
    ctx.lineTo(size * 0.5, size * 0.5);
    ctx.lineTo(size * 0.65, size * 0.35);
    ctx.stroke();
    
    // Bottom lines
    ctx.beginPath();
    ctx.moveTo(size * 0.3, size * 0.7);
    ctx.lineTo(size * 0.7, size * 0.7);
    ctx.stroke();
    
    if (type === 'error') {
        // Add X for error state
        ctx.strokeStyle = 'white';
        ctx.lineWidth = size / 24;
        ctx.beginPath();
        ctx.moveTo(size * 0.35, size * 0.8);
        ctx.lineTo(size * 0.45, size * 0.9);
        ctx.moveTo(size * 0.45, size * 0.8);
        ctx.lineTo(size * 0.35, size * 0.9);
        ctx.stroke();
    }
    
    return canvas.toBuffer();
}

// Create icons in different sizes
const sizes = [20, 40, 60, 72, 144];
const iconDir = path.join(__dirname, '..', 'com.sshadows.azure-devops-info.sdPlugin', 'imgs', 'actions', 'pr-checks');

// Ensure directory exists
if (!fs.existsSync(iconDir)) {
    fs.mkdirSync(iconDir, { recursive: true });
}

// Create normal PR icon
sizes.forEach(size => {
    const icon = createIcon(size, '#0078D4', 'normal');
    const filename = size === 144 ? 'pr@2x.png' : `pr.png`;
    const filepath = size === 144 ? 
        path.join(iconDir, filename) : 
        path.join(iconDir, size === 20 ? 'icon.png' : filename);
    
    if (size === 20 || size === 144) {
        fs.writeFileSync(filepath, icon);
        console.log(`Created ${filepath}`);
    }
});

// Create error PR icon
sizes.forEach(size => {
    const icon = createIcon(size, '#D13438', 'error');
    const filename = size === 144 ? 'pr-error@2x.png' : `pr-error.png`;
    const filepath = size === 144 ? 
        path.join(iconDir, filename) : 
        path.join(iconDir, size === 20 ? 'icon-error.png' : filename);
    
    if (size === 20 || size === 144) {
        fs.writeFileSync(filepath, icon);
        console.log(`Created ${filepath}`);
    }
});

console.log('PR icons created successfully!');