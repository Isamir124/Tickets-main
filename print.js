const fs = require('fs');
const path = require('path');

const EXCLUDED_DIRS = ['node_modules', '.git'];

function printTree(dir, prefix = '') {
    const files = fs.readdirSync(dir).filter(file => !EXCLUDED_DIRS.includes(file));

    files.forEach((file, index) => {
        const filePath = path.join(dir, file);
        const isLast = index === files.length - 1;
        const stats = fs.statSync(filePath);
        const connector = isLast ? '└── ' : '├── ';

        console.log(`${prefix}${connector}${file}`);

        if (stats.isDirectory()) {
            const newPrefix = prefix + (isLast ? '    ' : '│   ');
            printTree(filePath, newPrefix);
        }
    });
}

console.log('Estructura del proyecto:\n');
printTree('.');
