import fs from 'fs';

const content = fs.readFileSync('c:/Users/Zain/Desktop/mern-auth 1/frontend/src/components/Dashboard.jsx', 'utf8');

const lines = content.split('\n');
const stack = [];

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Simple line-level char scan, ignoring comments
    const cleanLine = line.replace(/\/\/.*$/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    
    for (let charIndex = 0; charIndex < cleanLine.length; charIndex++) {
        const char = cleanLine[charIndex];
        if (char === '{') {
            stack.push({ lineNum: i + 1, content: line.trim() });
        } else if (char === '}') {
            if (stack.length > 0) {
                stack.pop();
            } else {
                console.log(`Extra } at line ${i + 1}: ${line.trim()}`);
            }
        }
    }
}

console.log("\n--- UNCLOSED BRACES ---");
stack.forEach(item => {
    console.log(`Unclosed { at line ${item.lineNum}: ${item.content}`);
});
