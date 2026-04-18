const fs = require('fs');
const path = require('path');

const files = [
    'services/workers/aco.worker.ts',
    'services/workers/forest.worker.ts',
    'services/workers/genetic.worker.ts',
    'services/metaAnalystService.ts',
    'services/acoService.ts',
    'services/decisionTreeService.ts',
    'services/subscriptionService.ts',
    'services/prediction/combinationGenerator.ts',
    'services/prediction/predictionFacade.ts',
    'services/mathCore.ts',
    'services/forensicAuditService.ts',
    'services/mathService.ts'
];

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    
    if (content.includes('Math.random()')) {
        content = content.replace(/Math\.random\(\)/g, 'secureRandom()');
        
        let importPath = '';
        const depth = file.split('/').length - 1;
        if (depth === 1) importPath = '../utils/secureRandom';
        if (depth === 2) importPath = '../../utils/secureRandom';
        if (depth === 3) importPath = '../../../utils/secureRandom';

        const importStmt = `import { secureRandom } from '${importPath}';\n`;
        
        if (!content.includes('import { secureRandom }')) {
           const lines = content.split('\n');
           let importIndex = 0;
           for(let i=0; i<lines.length; i++) {
               if(lines[i].startsWith('import')) {
                   importIndex = i + 1;
               } else if(lines[i].trim() !== '' && !lines[i].startsWith('//') && !lines[i].startsWith('/*') && !lines[i].startsWith(' *')) {
                   break;
               }
           }
           lines.splice(importIndex, 0, importStmt);
           content = lines.join('\n');
        }

        fs.writeFileSync(file, content);
        console.log(`Updated ${file}`);
    }
});
