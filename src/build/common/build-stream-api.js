var path = require('path');
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var vfs = require('vinyl-fs');
var through2 = require('through2');
var resources = require('./resources');
var File = resources.File;
var createStreamWrapper = require('./stream-wrap').createStreamWrapper;
var FilterStream = require('streamfilter');
var Promise = require('bluebird');

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
    var logger = api.logging.get(config.target);

    exports.addToAPI(api, app, config);

    var buildStream = api.streams.create('input');
    var streamOrder = createStreams(api, app, config);

    // pipe all the streams together in the specified order
    streamOrder.map(function (id) {
      if (!id) { return; }

      buildStream = buildStream.pipe((api.streams.get(id) || api.streams.create(id))
        .on('end', function () {
          logger.log(id, 'complete');
        })
        .on('error', function (err) {
          logger.log(id, err);
        }));
    });

    // add a final sink so the last pipe has something draining it
    buildStream = buildStream.pipe(new ObjectSink());

    return new Promise(function (resolve, reject) {
        buildStream
          .on('finish', resolve)
          .on('error', reject);
      })
      .then(function () {
        logger.log('writing files complete');
      })
      .nodeify(cb);
  };
};

// token to return from onFile callbacks if the file should be removed
var REMOVE_FILE = {};

// adds stream api functions to the api object
exports.addToAPI = function (api, app, config) {

  var logger = api.logging.get(config.target);

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
        case 'image-compress':
          stream = require('./image-compress').create(api, app, config);
          break;
        case 'log':
          stream = createFileStream({
            onFile: function (file) {
              logger.log(file.path);
            }
          });
          break;
        case 'input':
          stream = resources.createFileStream(api, app, config, config.outputResourcePath);
          break;
        case 'output':
          // the spriter outputs files directly to the spritesheets directory
          // for performance reasons, and then inserts the spritesheet File
          // objects back into the stream so future streams know about them;
          // however, we can't actually write them out. This removes files that
          // have already been written.
          var filter = new FilterStream(function (file, enc, cb) {
            cb(file.written);
          }, {restore: true, objectMode: true, passthrough: true});

          return createStreamWrapper()
            .wrap(filter)
            .wrap(vfs.dest(config.outputResourcePath))
            .wrap(filter.restore);
        default:
          stream = createFileStream(opts);
          break;
      }

      stream.id = id;
      this.register(id, stream);
      return stream;
    },

    register: function (id, stream) {
      allStreams[id] = stream;
      return this;
    },

    createFileStream: createFileStream,

    REMOVE_FILE: REMOVE_FILE
  };

  /**
   * Simplifies creation of duplex object streams for the devkit use case of
   * streams that only contain File objects.
   *
   * @param {function} opts.onFile called for each file object in the stream
   *     with a function `addFile` that can be used to create and insert
   *     additional files into the stream.  Must return a Promise to delay the
   *     stream if it does any async work.
   * @param {function} opts.onFinish called when the stream ends with the same
   *     `addFile` function.  Useful for writing additional files to the stream.
   *     Must return a Promise to delay the stream if it does any async work.
   *     addFile accepts a dictionary with the keys/values:
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

    var blockingEnd = [];
    var stream = through2.obj(undefined,
          opts.onFile && onFile,
          onFinish);
    return stream;

    function onFile(file, enc, cb) {
      // don't end the read stream though until we've pushed all the data
      // through
      blockingEnd.push(Promise.resolve(opts.onFile.call(this, file))
        .then(function (res) {
          if (res !== api.streams.REMOVE_FILE) {
            stream.push(file);
          }
        }));

      // ok to write more
      cb();
    }

    function addFile(opts) {
      if (!opts) { return; }

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

      if (typeof opts.then == 'function') {
        // probably a promise, try to resolve first
        var beforeAddFile = Promise.resolve(opts).then(addFile);
        blockingEnd.push(beforeAddFile);
        return beforeAddFile;
      }

      // opts.src: copy file from source
      // filename: file should have contents
      var file = new File({src: app.paths.root, target: ''}, opts.src || opts.filename, config.outputResourcePath);

      if (opts.src && opts.filename) {
        file.moveToFile(opts.filename);
      }

      // copy extra keys to file object
      for (var key in opts) {
        if (key != 'src' && key != 'contents' && key != 'filename') {
          file[key] = opts[key];
        }
      }

      logger.log("creating", file.relative);

      if (opts.contents) {
        var onContents = Promise.resolve(opts.contents)
          .then(function (contents) {
            file.setContents(contents);
            stream.push(file);
          });
        blockingEnd.push(onContents);
      } else {
        stream.push(file);
      }
    }

    // called by through2 when the write stream has finished
    function onFinish(cb) {
      return Promise.try(function () {
          if (opts.onFinish) {
            return opts.onFinish.call(stream, addFile);
          }
        })
        .then(function () {
          // while we're waiting for promises to finish, we can't call the write
          // finish callback since we may still want to push stuff onto the read
          // stream.  If we call the callback now and there's nothing in the
          // read stream, it'll emit the read 'end' event and we'll be unable to
          // push more data.
          return blockingEnd;
        })
        .all()
        .then(function () {
          cb();
        });
    }
  }
};

function ObjectSink() {
  EventEmitter.call(this);
  this.writable = true;
}

util.inherits(ObjectSink, EventEmitter);

ObjectSink.prototype.write = function write(chunk, encoding, callback) {
  return true;
};

ObjectSink.prototype.end = function () {
  this.emit('finish');
  return true;
};
