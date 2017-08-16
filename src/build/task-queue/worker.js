const util = require('util');
const debug = require('debug');


const log = debug('devkit-core:build:task-queue:worker:' + process.pid);
log('Worker started:', process.pid);


// can be run as a worker with child_process.fork
if (require.main !== module) {
  throw new Error("expected to be run as the main module in node");
}

process.on('message', function (evt) {
  var id = evt.id;
  var task = evt.task;
  var opts = evt.opts;
  log(`onMessage: ${id} ${task} ${typeof opts}`);
  if (task.indexOf('/SpriteTask') > 0) {
    log('> opts=', util.inspect(opts, { depth: 3, maxArrayLength: 8 }));
  }

  require(task)
    .run(opts)
    .then(function (res) {
      log(`> result: ${id} ${typeof res}`);
      process.send({
        id: id,
        res: res
      });
    })
    .catch(function (e) {
      if (e.message === 'channel closed') {
        return;
      }
      log(e.stack || e);
    });
});
