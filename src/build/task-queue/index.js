var path = require('path');
var Promise = require('bluebird');
var fork = require('child_process').fork;

var DEFAULT_NUM_WORKERS = require('os').cpus().length;
var DEFAULT_TASKS_PER_WORKER = 1;

exports.TaskQueue = TaskQueue;
exports.DEFAULT_NUM_WORKERS = DEFAULT_NUM_WORKERS;
exports.DEFAULT_TASKS_PER_WORKER = DEFAULT_TASKS_PER_WORKER;

function TaskQueue(numWorkers, tasksPerWorker) {
  if (numWorkers === 0) {
    this._isLocal = true;
    this._maxWorkers = 0;
    this._tasksPerWorker = 0;
  } else {
    this._maxWorkers = numWorkers || DEFAULT_NUM_WORKERS;
    this._tasksPerWorker = tasksPerWorker || DEFAULT_TASKS_PER_WORKER;
  }

  this._eventId = 0;
  this._callbacks = {};
  this._workers = [];
  this._pendingTasks = [];

  this._workerScript = path.join(__dirname, 'worker');
}

TaskQueue.prototype.shutdown = function () {
  this._workers.forEach(function (worker) {
    worker.child.disconnect();
  });
  this._workers = [];
};

TaskQueue.prototype._createWorker = function () {
  var child = fork(this._workerScript);
  var worker = {
    tasks: 0,
    child: child
  };

  child.on('message', this._onMessage.bind(this, worker));
  this._workers.push(worker);
  return worker;
};

TaskQueue.prototype._onMessage = function (worker, message) {
  var callbacks = this._callbacks;
  if (message.id in callbacks) {
    // complete the task callback
    var taskHandle = callbacks[message.id];
    delete callbacks[message.id];
    taskHandle.resolve(message.res);

    // schedule the next task
    if (this._pendingTasks[0]) {
      this._pendingTasks.shift()(worker);
    } else {
      --worker.tasks;
    }
  } else {
    console.error("TASK COMPLETED WITH NO LISTENER", message.id);
  }
};

TaskQueue.prototype.run = function (task, opts) {
  if (this._isLocal) {
    return require(task).run(opts);
  }

  var id = this._eventId++;
  var callbacks = this._callbacks;

  return this._getWorkerForTask()
    .then(function (worker) {
      return new Promise(function (resolve, reject) {
        callbacks[id] = {
          worker: worker,
          resolve: resolve,
          reject: reject
        };

        // console.log('sending task', id, 'to worker with', worker.tasks, 'tasks');
        worker.child.send({
          id: id,
          task: task,
          opts: opts
        });
      });
    }.bind(this));
};

TaskQueue.prototype._getWorkerForTask = function () {
  return new Promise(function (resolve) {
    this._workers.sort(function (a, b) {
      return a.tasks - b.tasks;
    });

    var worker = this._workers[0];
    if (!worker || worker.tasks > 0 && this._workers.length < this._maxWorkers) {
      worker = this._createWorker();
    }

    if (worker.tasks < this._tasksPerWorker) {
      ++worker.tasks;
      resolve(worker);
    } else {
      this._pendingTasks.push(resolve);
    }
  }.bind(this));
};
