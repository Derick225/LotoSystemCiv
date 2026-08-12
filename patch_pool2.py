import re

with open('services/prediction/predictionFacade.ts', 'r') as f:
    content = f.read()

# Add import
if "import { packHistory }" not in content:
    content = "import { packHistory } from '../workers/zeroCopy';\\n" + content

# Replace postMessage
old_post = """        worker.postMessage({
          taskId: `MASTER_${Date.now()}`,
          type: "master",
          drawName: context.drawName,
          history: context.history,
          temporalDepth: context.temporalDepth,
          weightsToUse: context.weightsToUse,
          metrics: context.metrics,
          symbioticContext: context.symbioticContext,
          skipTraining: context.skipTraining,
          adversarialMode: context.adversarialMode,
          forcedOutsiderCount: context.forcedOutsiderCount,
          isForensicOptimized: context.isForensicOptimized,
          useSpatioTemporalHawkes: context.useSpatioTemporalHawkes ?? true,
          preloadedForensicReports: context.preloadedForensicReports
        });"""

new_post = """        const packed = packHistory(context.history as any);
        worker.postMessage({
          taskId: `MASTER_${Date.now()}`,
          type: "master",
          drawName: context.drawName,
          historyBuffer: packed.historyBuffer,
          drawCount: packed.drawCount,
          winningCount: packed.winningCount,
          totalCols: packed.totalCols,
          temporalDepth: context.temporalDepth,
          weightsToUse: context.weightsToUse,
          metrics: context.metrics,
          symbioticContext: context.symbioticContext,
          skipTraining: context.skipTraining,
          adversarialMode: context.adversarialMode,
          forcedOutsiderCount: context.forcedOutsiderCount,
          isForensicOptimized: context.isForensicOptimized,
          useSpatioTemporalHawkes: context.useSpatioTemporalHawkes ?? true,
          preloadedForensicReports: context.preloadedForensicReports
        }, [packed.historyBuffer]);"""

content = content.replace(old_post, new_post)
content = content.replace("\\n", "\n")

with open('services/prediction/predictionFacade.ts', 'w') as f:
    f.write(content)
