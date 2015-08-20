var path = require('path');
var through2 = require('through2');
var File = require('vinyl');

/**
 * Convenience functions for modifying the devkit build stream.  Simplifies the
 * through2 API for a pass-through stream:
 *   createFilterStream(onEach, onEnd):
 *      - onEach(file):
 *          return `api.STREAM_REMOVE_FILE` to remove the file from the stream,
 *          otherwise the file is passed through
 *      - onEnd(addFile, cb):
 *          call `addFile(filename, contents)` to insert a file into the stream,
 *          call `cb()` when finished (to end the current stream)
 */

// adds stream api functions to the api object
exports.addToAPI = function (api, app, config) {

  api.STREAM_REMOVE_FILE = {};

  api.streams = {
    get: function (key, opts) {
      switch (key) {
        case 'spriter':
          return require('./spriter').sprite(api, config);
        case 'inline-cache':
          return require('./inlineCache').create(api);
        case 'app-js':
          return require('./appJS').create(api, app, config, opts);
        case 'fonts':
          return require('./fonts').create(api, config);
        case 'html':
          return require('./html').create(api, app, config, opts);
      }
    },

    /**
     * Simplifies creation of duplex object streams for the devkit use case of
     * streams that only contain File objects.
     *
     * @param opts.parent {Stream} another stream that this stream should wrap. When
     *     something pipes to the new stream, the files are first sent through
     *     the parent stream.  Effectively, this new stream encapsulates and
     *     hides the parent stream (nothing need/should pipe to the parent
     *     stream).
     * @param opts.onFile {function} called for each file object in the stream
     *     with a function `addFile` that can be used to create and insert
     *     additional files into the stream.  Must return a Promise to delay the
     *     stream if it does any async work.
     * @param opts.onEnd {function} called when the stream ends with the same
     *     `addFile` function.  Useful for writing additional files to the
     *     stream. Must return a Promise to delay the stream if it does any
     *     async work.
     */
    create: function (opts) {

      // if we're proxying to another stream,
      var blockingEnd = [];

      var stream = through2.obj(undefined, function onFile(file, enc, cb) {
        if (opts.parent) {
          opts.parent.write(file);
          cb();
        } else if (opts.onFile) {
          opts.onFile.call(this, file).nodeify(cb);
        }
      }, function onEnd(cb) {
        if (opts.parent) {
          opts.parent.end();
        }

        Promise.all(blockingEnd)
          .bind(this)
          .then(function () {
            if (opts.onEnd) {
              return opts.onEnd.call(this, addFile.bind(this));
            }
          })
          .nodeify(cb);
      });

      // proxy events to ourself
      if (opts.parent) {
        opts.parent.on('data', function (file) {
          if (opts.onFile) {
            var promise = opts.onFile.call(stream, file);
            if (promise && promise instanceof Promise) {
              blockingEnd.push(promise);
              promise.then(function () {
                blockingEnd.splice(blockingEnd.indexOf(promise), 1);
              });
            }
          }
        });

        blockingEnd.push(new Promise(function (resolve) {
          opts.parent.on('end', resolve);
        }));

        opts.parent.on('error', function (err) {
          stream.emit('error', err);
        });
      }

      return stream;
    }
  };

  api.streamToPromise = function (stream) {
    return new Promise(function (resolve, reject) {
      stream
        .on('end', resolve)
        .on('error', reject);
    });
  };

  function addFile(filename, contents, opts) {
    var file = new File({
      base: config.outputResourcePath,
      path: path.join(config.outputResourcePath, filename),
      contents: typeof contents == 'string' ? new Buffer(contents) : contents
    });

    if (opts && ('inline' in opts)) {
      file.inline = opts.inline;
    }

    this.push(file);
  }

  api.createFilterStream = function (each, atEnd) {
    return through2.obj(undefined, function onFile(file, enc, cb) {
      // each returns true to remove the file from the stream
      if (!each || each.call(this, file) !== api.STREAM_REMOVE_FILE) {
        this.push(file);
      }

      cb();
    }, function (cb) {
      atEnd = atEnd || this.onEnd;
      if (atEnd) {
        atEnd.call(this, addFile.bind(this), cb);
      } else {
        cb();
      }
    });
  };

  api.createEndStream = function (atEnd) {
    return api.createFilterStream(undefined, atEnd);
  };

  /**
   * Inserts an array of files. Any promises in the array are resolved first.
   *
   * Array (post-promise resolution) can contain:
   *   - vinyl File objects
   *   - file object with a name (path relative to the output directory) and the
   *     file contents
   *   - function that willb e called with (atEnd, cb)
   */
  api.insertFilesStream = function (files) {
    return api.createEndStream(function (addFile, cb) {
      Promise.resolve(files)
        .bind(this)
        .map(function (file) {
          if (typeof file == 'function') {
            var onEnd = file;
            return new Promise(function (resolve, reject) {
              onEnd(addFile, resolve);
            });
          } else if (file instanceof File) {
            this.push(file);
          } else if (file.name) {
            addFile(file.name, file.contents);
          }
        })
        .nodeify(cb);
    });
  };

};
