/**
 * Worker Pool for parallel task execution
 */

/**
 * Create a worker pool
 * @param {Object} options - Configuration options
 * @param {number} options.size - Number of workers in pool
 * @param {string} options.workerUrl - URL to worker script
 * @returns {Object} Worker pool instance
 */
export function createWorkerPool({ size, workerUrl }) {
  const workers = [];
  let currentWorkerIndex = 0;
  let activeTasks = 0;
  const taskQueue = [];
  const taskResolvers = new Map();
  let taskIdCounter = 0;

  // Create workers
  for (let i = 0; i < size; i++) {
    const worker = new Worker(workerUrl, { type: 'module' });
    
    worker.onmessage = (e) => {
      const { taskId, type, payload, error } = e.data;

      if (type === 'task-complete') {
        const resolver = taskResolvers.get(taskId);
        if (resolver) {
          resolver.resolve(payload);
          taskResolvers.delete(taskId);
        }
        activeTasks--;
        processQueue();
      } else if (type === 'task-error') {
        const resolver = taskResolvers.get(taskId);
        if (resolver) {
          resolver.reject(new Error(error || 'Worker task failed'));
          taskResolvers.delete(taskId);
        }
        activeTasks--;
        processQueue();
      } else if (type === 'progress' || type === 'city-ids') {
        // Forward progress events and city IDs
        const resolver = taskResolvers.get(taskId);
        if (resolver && resolver.onProgress) {
          resolver.onProgress({ type, payload });
        }
      }
    };

    worker.onerror = (error) => {
      console.error('Worker error:', error);
      // Reject all pending tasks for this worker
      taskResolvers.forEach((resolver, id) => {
        resolver.reject(error);
      });
      taskResolvers.clear();
    };

    workers.push(worker);
  }

  /**
   * Process queued tasks
   */
  function processQueue() {
    while (taskQueue.length > 0 && activeTasks < workers.length) {
      const task = taskQueue.shift();
      executeTask(task);
    }
  }

  /**
   * Execute a task on an available worker
   */
  function executeTask(task) {
    const worker = workers[currentWorkerIndex];
    currentWorkerIndex = (currentWorkerIndex + 1) % workers.length;
    activeTasks++;

    // Extract transferable buffers from payload
    const transferables = [];
    if (task.payload.sharedBuffers) {
      const sb = task.payload.sharedBuffers;
      if (sb.indexBuffer) transferables.push(sb.indexBuffer);
      if (sb.latBuffer) transferables.push(sb.latBuffer);
      if (sb.lonBuffer) transferables.push(sb.lonBuffer);
      if (sb.popBuffer) transferables.push(sb.popBuffer);
      if (sb.idxBuffer) transferables.push(sb.idxBuffer);
    }

    worker.postMessage({
      taskId: task.taskId,
      payload: task.payload
    }, transferables.length > 0 ? transferables : undefined);
  }

  return {
    /**
     * Run a task (returns promise)
     * @param {Object} payload - Task payload
     * @param {Function} onProgress - Optional progress callback
     * @returns {Promise} Promise that resolves when task completes
     */
    async runTask(payload, onProgress = null) {
      return new Promise((resolve, reject) => {
        const taskId = taskIdCounter++;
        const task = {
          taskId,
          payload,
          resolve,
          reject,
          onProgress
        };

        taskResolvers.set(taskId, task);

        if (activeTasks < workers.length) {
          executeTask(task);
        } else {
          taskQueue.push(task);
        }
      });
    },

    /**
     * Get number of active tasks
     * @returns {number}
     */
    getActiveTasks() {
      return activeTasks;
    },

    /**
     * Get queue length
     * @returns {number}
     */
    getQueueLength() {
      return taskQueue.length;
    },

    /**
     * Terminate all workers
     */
    terminate() {
      workers.forEach(worker => worker.terminate());
      workers.length = 0;
      taskQueue.length = 0;
      taskResolvers.clear();
      activeTasks = 0;
    }
  };
}
