// can be run as a worker with child_process.fork
if (require.main !== module) {
  throw new Error("expected to be run as the main module in node");
}

process.on('message', function (evt) {
  var id = evt.id;
  var task = evt.task;
  var opts = evt.opts;

  require(task)
    .run(opts)
    .then(function (res) {
      process.send({
        id: id,
        res: res
      });
    })
    .catch(function (e) {
      if (e.message === 'channel closed') {
        return;
      }
      console.log(e.stack || e);
    });
});
