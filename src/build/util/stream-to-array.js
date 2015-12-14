var Promise = require('bluebird');

module.exports = function (stream) {
  return !stream.readable
    ? Promise.resolve([])
    : new Promise(function (resolve, reject) {
      // stream already ended
      if (!stream.readable) {
        return resolve([]);
      }

      var arr = [];

      stream.on('data', onData);
      stream.on('end', onEnd);
      stream.on('error', onEnd);
      stream.on('close', onClose);

      function onData(data) {
        arr.push(data);
      }

      function onEnd(err) {
        if (err) {
          reject(err);
        } else {
          resolve(arr);
        }

        cleanup();
      }

      function onClose() {
        resolve();
        cleanup();
      }

      function cleanup() {
        arr = null;
        stream
          .removeListener('data', onData)
          .removeListener('end', onEnd)
          .removeListener('error', onEnd)
          .removeListener('close', onClose);
      }
    });
};
