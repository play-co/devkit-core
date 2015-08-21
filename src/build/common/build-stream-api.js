var path = require('path');
var through2 = require('through2');
var resources = require('./resources');
var vfs = require('vinyl-fs');
var File = resources.File;

/**
 * DevKit build targets exports a function build(api, app, config cb).  To
 * create a streaming build target (a build target composed of several streams),
 * To create a streaming build target, call createStreamingBuild() and export
 * the result as the build function.
 *
 * `createStreamingBuild` takes a single arugment, createStreams, that returns
 * the order in which the streams should be composed.  By delegating this to a
 * function call, build targets can inherit from each other -- one build target
 * can call the createStreams function from another build target and perform
 * modifications to it -- insert additional streams, remove existing streams,
 * insert extra static files, etc.
 *
 * Working with streams directly can be painful, so to facilitate creating and
 * connecting streams, devkit-core wraps the through2 library with a higher-
 * level file stream.  When creating a streaming build, extra functions are
 * added to the api:
 *
 *    (note: streams are stored and referenced by a string id)
 *    - register(id, stream) stores a stream under a given id
 *    - get(id) returns the stream corresponding to an id
 *    - create(id, opts) common streams can be created and registered quickly by
 *      calling create with a preset id:
 *        - spriter - the devkit-spriter
 *        - inline-cache - filters out inlinable files, usually wrapped by the
 *          app-js stream
 *        - app-js - wraps inline-cache and constructs a compiled app js file
 *        - fonts - moves fonts to resources/fonts and (optionally) embeds fonts
 *          into css
 *        - html - generates index.html for browser games
 *        - static-files - does nothing by default, but after creating it, you
 *          can get a reference to it using api.streams.get('static-files'). The
 *          stream object has a convenience function .add() for functionally
 *          adding files.  See createFileStream for help constructing valid
 *          parameters to .add().
 *
 * So in short, create/register a bunch of streams, then return the ids in the
 * order in which they should be connected.  Write new streams for additional
 * processing.
 */
exports.createStreamingBuild = function (createStreams) {
  return function (api, app, config, cb) {
    exports.addToAPI(api, app, config);

    var outputDirectory = config.outputResourcePath;
    var buildStream = resources.createFileStream(api, app, config, outputDirectory);
    var streamOrder = createStreams(api, app, config);

    // pipe all the streams together in the specified order
    streamOrder.map(function (id) {
      var nextStream = api.streams.get(id);
      buildStream = buildStream.pipe(nextStream);
    });

    buildStream = buildStream.pipe(vfs.dest(outputDirectory));

    return streamToPromise(buildStream)
      .nodeify(cb);
  };
};

// token to return from onFile callbacks if the file should be removed
var REMOVE_FILE = {};

// adds stream api functions to the api object
exports.addToAPI = function (api, app, config) {

  var allStreams = {};

  api.streams = {
    get: function (id) {
      return allStreams[id];
    },
    create: function (id, opts) {
      var stream;
      switch (id) {
        case 'spriter':
          stream = require('./spriter').sprite(api, config);
          break;
        case 'inline-cache':
          stream = require('./inlineCache').create(api);
          break;
        case 'app-js':
          stream = require('./appJS').create(api, app, config, opts);
          break;
        case 'fonts':
          stream = require('./fontStream').create(api, config);
          break;
        case 'html':
          stream = require('./html').create(api, app, config, opts);
          break;
        case 'static-files':
          stream = require('./static-files').create(api, app, config);
          break;
        default:
          stream = createFileStream(opts);
          break;
      }

      return this.register(id, stream);
    },

    register: function (id, stream) {
      allStreams[id] = stream;
      return this;
    },

    createFileStream: createFileStream,

    streamToPromise: streamToPromise,

    REMOVE_FILE: REMOVE_FILE
  };

  /**
   * Simplifies creation of duplex object streams for the devkit use case of
   * streams that only contain File objects.
   *
   * @param {Stream} opts.parent another stream that this stream should wrap. When
   *     something pipes to the new stream, the files are first sent through
   *     the parent stream.  Effectively, this new stream encapsulates and
   *     hides the parent stream (nothing need/should pipe to the parent
   *     stream).
   * @param {function} opts.onFile called for each file object in the stream
   *     with a function `addFile` that can be used to create and insert
   *     additional files into the stream.  Must return a Promise to delay the
   *     stream if it does any async work.
   * @param {function} opts.onEnd called when the stream ends with the same
   *     `addFile` function.  Useful for writing additional files to the
   *     stream. Must return a Promise to delay the stream if it does any
   *     async work. addFile accepts a dictionary with the keys/values:
   *
   *       filename {string}  relative path to file in build output
   *       contents {Buffer | string | Promise} (optional) buffer, string, or
   *                          promise for file's contents
   *       src      {string}  (optional) an absolute path or path relative to
   *                          the app directory from where to copy the contents
   *                          from. If contents is also set, the contents of src
   *                          are ignored.
   *       inline   {boolean} (optional) provides a hint to an inline cacher
   *                          later in the build pipe
   */
  function createFileStream(opts) {

    // if we're proxying to a parent stream, blockingEnd will contain a Promise
    // for each item emitted from the parent stream
    var blockingEnd = [];
    var addFilePromises = [];

    function onFile(file, enc, cb) {
      if (opts.parent) {
        opts.parent.write(file);
        cb();
      } else if (opts.onFile) {
        callOnFile(file)
          .then(function () {
            cb();
          });
      }
    }

    function callOnFile(file) {
      return Promise.resolve(opts.onFile.call(this, file))
        .then(function (res) {
          if (res !== api.streams.REMOVE_FILE) {
            stream.push(file);
          }
        });
    }

    function addFile(opts) {
      // legacy config, probably from app manifest -- only a single string is
      // provided with no instructions on where it goes
      if (typeof opts == 'string') {
        var filename = opts;
        if (path.isAbsolute(filename)) {
          // legacy config, just an absolute path is provided, copy the file to
          // the root of the output directory
          opts = {
              filename: path.basename(filename),
              src: filename
            };
        } else {
          if (/^\.[\/\\]/.test(filename)) {
            filename = filename[2];
          }

          if (/^\.\.\//.test(filename)) {
            throw new Error('relative path not supported: ' + filename);
          }

          // legacy config, relative project path
          opts = {
              filename: filename
            };
        }
      }

      if (opts instanceof Promise) {
        return Promise.resolve(opts).then(addFile);
      }

      // opts.src: copy file from source
      // filename: file should have contents
      var file = new File({src: app.paths.root, target: ''}, opts.src || opts.filename, config.outputResourcePath);

      if (opts.src && opts.filename) {
        file.moveToFile(opts.filename);
      }

      if (opts.inline !== undefined) {
        file.inline = !!opts.inline;
      }

      if (opts.contents) {
        var onContents = Promise.resolve(opts.contents)
          .then(function (contents) {
            file.setContents(contents);
            stream.push(file);
          });
        addFilePromises.push(onContents);
      } else {
        stream.push(file);
      }
    }

    function onEnd(cb) {
      if (opts.parent) {
        opts.parent.end();
      }

      return Promise.all(blockingEnd)
        .then(function () {
          if (opts.onEnd) {
            return opts.onEnd.call(stream, addFile);
          }
        })
        .then(function () {
          return addFilePromises;
        })
        .all()
        .then(function () {
          cb();
        });
    }

    var stream = through2.obj(undefined,
          (opts.parent || opts.onFile) && onFile,
          (opts.parent || opts.onEnd) && onEnd);

    // proxy events to ourself
    if (opts.parent) {
      opts.parent.on('data', function (file) {
        if (opts.onFile) {
          var promise = callOnFile(file);
          blockingEnd.push(promise);
          promise.then(function () {
            blockingEnd.splice(blockingEnd.indexOf(promise), 1);
          });
        } else {
          stream.emit('data', file);
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

function streamToPromise (stream) {
  return new Promise(function (resolve, reject) {
    stream
      .on('end', resolve)
      .on('error', reject);
  });
}
