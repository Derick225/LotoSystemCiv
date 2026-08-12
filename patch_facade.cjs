const fs = require('fs');
const file = './services/prediction/predictionFacade.ts';
let content = fs.readFileSync(file, 'utf8');

const target = `      return handleScenarioADegradedPrediction(context);
    },
    CACHE_TTL.LONG
  );`;

const replacement = `      return handleScenarioADegradedPrediction(context);
    },
    CACHE_TTL.MEDIUM,
    context.drawName
  );`;

content = content.replace(target, replacement);
fs.writeFileSync(file, content);
console.log("Done");
