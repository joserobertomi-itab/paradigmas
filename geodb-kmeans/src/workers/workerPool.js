/**
 * Worker Pool for parallel task execution
 */

/**
 * Create a worker pool
 * @param {Object} options - Configuration options
 * @param {number} options.size - Number of workers in pool
 * @param {string} [options.workerUrl] - URL to worker script (use with new Worker(url, { type: 'module' }))
 * @param {typeof Worker} [options.WorkerConstructor] - Vite ?worker constructor (preferred; use new WorkerConstructor())
 * @returns {Object} Worker pool instance
 */
export function createWorkerPool({ size, workerUrl, WorkerConstructor }) {
  const workers = [];
  let currentWorkerIndex = 0;
  let activeTasks = 0;
  const taskQueue = [];
  const taskResolvers = new Map();
  let taskIdCounter = 0;

  const createOne = WorkerConstructor
    ? () => new WorkerConstructor()
    : () => new Worker(workerUrl, { type: 'module' });

  // Create workers
  for (let i = 0; i < size; i++) {
    const worker = createOne();
    
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
      } else if (type === 'progress' || type === 'city-ids' || type === 'radius-result') {
        // Forward progress events, city IDs, and radius results
        const resolver = taskResolvers.get(taskId);
        if (resolver && resolver.onProgress) {
          resolver.onProgress({ type, payload });
        }
      }
    };

    worker.onerror = (ev) => {
      const parts = [];
      if (ev?.message) parts.push(ev.message);
      else if (ev?.error?.message) parts.push(ev.error.message);
      else parts.push('Worker script error');
      if (ev?.filename) parts.push(` at ${ev.filename}`);
      if (ev?.lineno != null) parts.push(`:${ev.lineno}`);
      if (ev?.colno != null) parts.push(`:${ev.colno}`);
      const msg = parts.join('');
      console.error('Worker error:', msg, ev);
      const err = ev instanceof Error ? ev : new Error(msg);
      taskResolvers.forEach((resolver) => {
        resolver.reject(err);
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

    // SharedArrayBuffer objects are automatically shared when passed via postMessage
    // They CANNOT be in the transfer list - that causes an error
    // Just pass the payload without a transfer list
    worker.postMessage({
      taskId: task.taskId,
      payload: task.payload
    });
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
