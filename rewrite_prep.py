import re

with open('components/tabs/SimulationLab.tsx', 'r') as f:
    content = f.read()

new_prepare = """
  const prepareData = () => {
    if (fileData) {
      const samples = Math.min(fileData.length, 500);
      const X = tf.randomNormal([samples, 10]); // fallback
      const Y = tf.randomUniform([samples, 5]); // fallback
      return { X, Y };
    } else {
      if (history.length < 20) {
         // Fallback if not enough history
         const samples = 100;
         const X = tf.randomNormal([samples, 10]);
         const Y = tf.randomUniform([samples, 5]);
         return { X, Y };
      }
      const samples = Math.min(history.length - 1, 500);
      const xData: number[][] = [];
      const yData: number[][] = [];
      
      for (let i = 0; i < samples; i++) {
        const currentDraw = history[i + 1];
        const nextDraw = history[i]; // Remember history is sorted newest first
        if (!currentDraw || !nextDraw) continue;
        
        // Features: 5 winning numbers, normalized
        const features = [...currentDraw.gagnants].map(n => n / 90);
        // Add 5 more synthetic features (e.g., differences, gaps)
        for (let j = 0; j < 5; j++) {
           features.push(j < currentDraw.gagnants.length - 1 ? (currentDraw.gagnants[j+1] - currentDraw.gagnants[j]) / 90 : 0);
        }
        
        // Labels: next draw winning numbers, normalized
        const labels = [...nextDraw.gagnants].map(n => n / 90);
        
        xData.push(features);
        yData.push(labels);
      }
      
      const X = tf.tensor2d(xData, [xData.length, 10]);
      const Y = tf.tensor2d(yData, [yData.length, 5]);
      return { X, Y };
    }
  };
"""

content = re.sub(r'const prepareData = \(\) => \{.*?\n  \};', new_prepare.strip(), content, flags=re.DOTALL)

with open('components/tabs/SimulationLab.tsx', 'w') as f:
    f.write(content)
