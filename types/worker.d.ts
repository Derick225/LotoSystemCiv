
declare module "*.worker.ts" {
  class WebpackWorker extends Worker {
    constructor();
  }
  export default WebpackWorker;
}

declare module "*?worker" {
  const workerConstructor: {
    new (): Worker;
  };
  export default workerConstructor;
}
