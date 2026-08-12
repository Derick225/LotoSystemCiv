const fs = require('fs');
const file = './components/tabs/MetaAnalystTab.tsx';
let content = fs.readFileSync(file, 'utf8');

const target1 = `  if (nexusLoading || loading || isBacktesting) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <PredictionComputationOverlay
          isComputing={true}
          computingStep={
            loadingStep ||
            (isBacktesting
              ? "Rétro-audit temporel..."
              : "Fusion des tenseurs probabilistes...")
          }
          historyLength={history.length}
          progress={loadingProgress}
        />
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] p-8 text-center bg-slate-900/50 rounded-3xl border border-white/5">
        <div className="p-6 bg-slate-900 rounded-full shadow-2xl mb-8 border border-white/5">
          <Layers size={64} className="text-slate-500" />
        </div>
        <h2 className="text-3xl md:text-5xl font-black text-white tracking-tighter mb-4">
          Nexus <span className="text-indigo-500">Platinum</span>
        </h2>
        <p className="text-slate-400 max-w-md text-sm font-medium leading-relaxed mb-10">
          Activez le moteur de fusion tensorielle pour générer un spectre de
          probabilité unifié à partir de tous les modèles disponibles.
        </p>
        <button
          onClick={runAnalysis}
          className="px-10 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-indigo-600/20 transition-all active:scale-95 flex items-center gap-3 group"
        >
          <Zap
            size={18}
            className="group-hover:text-yellow-300 transition-colors"
          />{" "}
          Initialiser le Système
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-20 w-full overflow-hidden">`;

const replacement1 = `  return (
    <div className="space-y-6 animate-fade-in pb-20 w-full overflow-hidden">
      <PredictionComputationOverlay
        isComputing={nexusLoading || loading || isBacktesting}
        computingStep={
          loadingStep ||
          (isBacktesting
            ? "Rétro-audit temporel..."
            : "Fusion des tenseurs probabilistes...")
        }
        historyLength={history.length}
        progress={loadingProgress}
      />

      {!result && !(nexusLoading || loading || isBacktesting) && (
        <div className="flex flex-col items-center justify-center min-h-[500px] p-8 text-center bg-slate-900/50 rounded-3xl border border-white/5">
          <div className="p-6 bg-slate-900 rounded-full shadow-2xl mb-8 border border-white/5">
            <Layers size={64} className="text-slate-500" />
          </div>
          <h2 className="text-3xl md:text-5xl font-black text-white tracking-tighter mb-4">
            Nexus <span className="text-indigo-500">Platinum</span>
          </h2>
          <p className="text-slate-400 max-w-md text-sm font-medium leading-relaxed mb-10">
            Activez le moteur de fusion tensorielle pour générer un spectre de
            probabilité unifié à partir de tous les modèles disponibles.
          </p>
          <button
            onClick={runAnalysis}
            className="px-10 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-indigo-600/20 transition-all active:scale-95 flex items-center gap-3 group"
          >
            <Zap
              size={18}
              className="group-hover:text-yellow-300 transition-colors"
            />{" "}
            Initialiser le Système
          </button>
        </div>
      )}

      {result && (
        <>`;

const target2 = `        )}
      </AnimatePresence>
    </div>
  );
};`;

const replacement2 = `        )}
      </AnimatePresence>
      </>}
    </div>
  );
};`;

content = content.replace(target1, replacement1);
content = content.replace(target2, replacement2);
fs.writeFileSync(file, content);
console.log("Done");
