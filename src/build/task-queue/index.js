const util = require('util');
var path = require('path');
var Promise = require('bluebird');
var fork = require('child_process').fork;
const debug = require('debug');
const chalk = require('chalk');


const log = debug('devkit-core:build:task-queue');


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
  log('Creating worker:', this._workerScript);
  const nodeBinPath = process.env.NODE;
  if (!nodeBinPath) {
    throw new Error('process.env.NODE not set');
  }

  var child = fork(this._workerScript, [], {
    silent: true,
    stdio: 'pipe',
    execPath: nodeBinPath
  });
  log('> pid=', child.pid);
  var worker = {
    tasks: 0,
    child: child
  };

  child.stdout.on('data', (data) => {
    log(`[${chalk.yellow(child.pid)} OUT] ${data}`);
  });
  child.stderr.on('data', (data) => {
    log(`[${chalk.yellow(child.pid)} ${chalk.red('ERR')}] ${data}`);
  });

  child.on('message', this._onMessage.bind(this, worker));

  child.on('close', (code) => {
    if (code !== 0) {
      console.error('Worker exited with nonzero exit code:', code);
      process.exit(1);
    }
    log('Worker closed:', child.pid);
  });
  child.on('error', (err) => {
    console.error('Worker error:', err);
    process.exit(2);
  });
  this._workers.push(worker);
  return worker;
};

TaskQueue.prototype._onMessage = function (worker, message) {
  log('onMessage: message.id=', message.id);
  var callbacks = this._callbacks;
  if (message.id in callbacks) {
    // complete the task callback
    var taskHandle = callbacks[message.id];
    delete callbacks[message.id];
    taskHandle.resolve(message.res);

    // schedule the next task
    if (this._pendingTasks[0]) {
      log('> Still have pending tasks, length=', this._pendingTasks.length);
      this._pendingTasks.shift()(worker);
    } else {
      --worker.tasks;
      log('> Worker', worker.child.pid, 'has', worker.tasks, 'remaining tasks');
    }
  } else {
    console.error('TASK COMPLETED WITH NO LISTENER', message.id);
  }

  log(this._getSummaryText());
};

TaskQueue.prototype._getSummaryText = function () {
  const workerSummaries = [];
  for (let i = 0; i < this._workers.length; i++) {
    const worker = this._workers[i];
    let workerSummary = '\tWorker index=' + i;
    if (worker.child) {
      workerSummary += '\tChild process pid= ' + worker.child.pid;
    } else {
      workerSummary += '\tChild process is falsey';
    }
    workerSummary += '\tTask count=' + worker.tasks;
    workerSummaries.push(workerSummary);
  }
  let s = 'TaskQueue Summary:';
  s += '\n\tPending task count=' + this._pendingTasks.length;
  s += '\n\tWorker count=' + this._workers.length;
  s += '\n' + workerSummaries.join('\n');
  return s;
};

TaskQueue.prototype.run = function (task, opts) {
  log('run: task=', task, 'typeof opts=', typeof opts);
  if (this._isLocal) {
    log('> _isLocal, running in current process');
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
    log('_getWorkerForTask');
    this._workers.sort(function (a, b) {
      return a.tasks - b.tasks;
    });

    var worker = this._workers[0];
    if (!worker || worker.tasks > 0 && this._workers.length < this._maxWorkers) {
      log('> Creating new worker');
      worker = this._createWorker();
    }

    if (worker.tasks < this._tasksPerWorker) {
      ++worker.tasks;
      log('> Assigning to worker ' + worker.child.pid + ', worker has ' + worker.tasks + ' tasks');
      resolve(worker);
    } else {
      this._pendingTasks.push(resolve);
      log('> Adding to _pendingTasks, _pendingTasks.length=' + this._pendingTasks.length);
    }
  }.bind(this));
};
