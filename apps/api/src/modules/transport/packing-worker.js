const {parentPort,workerData}=require('node:worker_threads');
try {parentPort.postMessage(require('./packing-engine').pack(workerData));}
catch(error) {parentPort.postMessage({error:error.message});}
