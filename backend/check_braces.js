import fs from 'fs';

const content = fs.readFileSync('c:/Users/Zain/Desktop/mern-auth 1/frontend/src/components/Dashboard.jsx', 'utf8');

let braceCount = 0;
let parenCount = 0;
let bracketCount = 0;
const lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Remove comments
    const cleanLine = line.replace(/\/\/.*$/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    
    for (let char of cleanLine) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
        if (char === '(') parenCount++;
        if (char === ')') parenCount--;
        if (char === '[') bracketCount++;
        if (char === ']') bracketCount--;
    }

    if (braceCount < 0) {
        console.log(`Mismatch: Extra } at line ${i + 1}: ${line.trim()}`);
        braceCount = 0;
    }
    if (parenCount < 0) {
        console.log(`Mismatch: Extra ) at line ${i + 1}: ${line.trim()}`);
        parenCount = 0;
    }
    if (bracketCount < 0) {
        console.log(`Mismatch: Extra ] at line ${i + 1}: ${line.trim()}`);
        bracketCount = 0;
    }
}

console.log(`Final Counts - Braces: ${braceCount}, Parens: ${parenCount}, Brackets: ${bracketCount}`);
