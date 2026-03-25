const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
    });
}

walkDir('./components', function(filePath) {
    if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
        let content = fs.readFileSync(filePath, 'utf8');
        let modified = false;

        // Replace import
        const importRegex = /import\s+\{\s*useNexus\s*\}\s+from\s+['"](.*)NexusProvider['"];/g;
        if (importRegex.test(content)) {
            content = content.replace(importRegex, (match, p1) => {
                // p1 is the relative path prefix, e.g., '../' or './'
                // We need to point to store/useNexusStore
                // If p1 is '../', it means we are in components/tabs/ and NexusProvider is in components/
                // So store is in ../store/useNexusStore
                // If p1 is './', it means we are in components/ and NexusProvider is in components/
                // So store is in ../store/useNexusStore
                let newPath = '';
                if (p1 === '../') {
                    newPath = '../../store/useNexusStore';
                } else if (p1 === './') {
                    newPath = '../store/useNexusStore';
                } else {
                    newPath = '../store/useNexusStore'; // fallback
                }
                return `import { useNexusStore } from '${newPath}';`;
            });
            modified = true;
        }

        // Replace useNexus()
        if (content.includes('useNexus()')) {
            content = content.replace(/useNexus\(\)/g, 'useNexusStore()');
            modified = true;
        }

        if (modified) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`Updated ${filePath}`);
        }
    }
});
