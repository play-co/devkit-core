var util = require('util');
var EventEmitter = require('events').EventEmitter;
var vfs = require('vinyl-fs');
var resources = require('./common/resources');
var createStreamWrapper = require('./common/stream-wrap').createStreamWrapper;
var FilterStream = require('streamfilter');
var Promise = require('bluebird');

function BuildError(message, showStack) {
  this.message = message;
  this.showStack = showStack || false;
}

util.inherits(BuildError, Error);

exports.BuildError = BuildError;

/**
 * The DevKit build process expects each build target will export three
 * properties:
 *
 *  1. opts: an optimist instance for the command-line options specific to the
 *     current build target
 *  2. configure: a function for updating a build's `config` object with
 *     settings specific to the current build target
 *  3. build: a function to execute the build
 *
 * DevKit-core v4 updates the API used for creating builds to easily support
 * build streams, enabling faster builds with more customization and the ability
 * for builds to inherit logic and components from each other. As before, each
 * build target is a node.js module that exports the required build functions.
 * To create a build target in v4, in your build target module, require this file and use the function
 * `createBuildTarget` to setup the exports. You still need to provide the
 * `opts` export, but `createBuildTarget` will create and export the `configure`
 * and `build` functions for you.  Your build target should then export the
 * following functions:
 *
 *   - exports.init, called to setup the build's `config` object with settings
 *     specific to the current build target
 *
 *   - exports.setupStreams, called to setup the streams required for a build
 *     using one of the following helper functions:
 *
 *        - api.streams.create(id, opts) - initializes one of the built-in
 *          streams with optional opts (see below for a list of the built-in
 *          streams)
 *        - api.streams.register(id, stream) - registers a custom stream that
 *          can be used during a build, see api.streams.createFileStream for a
 *          convenience wrapper
 *        - api.streams.registerFunction(id, cb) - custom stream (calls cb at
 *          the end of the previous stream)
 *
 *     Note that id is a unique identifying string
 *
 *   - exports.getStreamOrder, called to get the order that the streams should
 *     be connected in, returns an array of stream ids (strings)
 *
 * Devkit calls these three functions, and then pipes the streams returned by
 * `exports.getStreamOrder` together with a source file stream.  This interface
 * allows build targets to easily inherit from each other by importing another
 * build target's module target and calling the other target's exported
 * functions.  Note that all of these functions may optionally return a
 * Promise to defer execution (though the core build targets do not for
 * simplicity).
 *
 * Working with streams directly can be tricky, so to facilitate creating and
 * connecting streams, devkit-core wraps the through2 library with a higher-
 * level file stream.
 *
 *    - spriter - the devkit-spriter
 *    - inline-cache - filters out inlinable files, usually wrapped by the
 *      app-js stream
 *    - app-js - wraps inline-cache and constructs a compiled app js file
 *    - fonts - moves fonts to resources/fonts and (optionally) embeds fonts
 *      into css
 *    - html - generates index.html for browser games
 *    - static-files - does nothing by default, but after creating it, you
 *      can get a reference to it using api.streams.get('static-files'). The
 *      stream object has a convenience function .add() for functionally
 *      adding files.  See createFileStream for help constructing valid
 *      parameters to .add().
 *    - write-files - writes the files to disk, unless they have the `written`
 *      flag set on them (the spriter, for example, writes files out directly
 *      but adds file objects back into the stream so that other streams such as
 *      the offline cache manifest know about the spritesheet files)
 */
exports.createBuildTarget = function (buildExports) {

  buildExports.configure = function (api, app, config, cb) {
    api.streams = exports.getStreamAPI(api, app, config);
    api.build = exports.getBuildAPI(api, app, config);

    // add in any common config keys
    require('./common/config').extend(app, config);

    return Promise.resolve(buildExports.init(api, app, config))
      .nodeify(cb);
  };

  buildExports.build = function (api, app, config, cb) {
    var logger = api.logging.get(config.target);
    if (!api.streams) {
      logger.error('api.streams not available! Did you forget to call',
        'build-stream-api\'s configure function in your configure step?');

      throw new BuildError('configuration error');
    }

    var buildStream = api.streams.create('src');
    return Promise.try(function () {
        return buildExports.setupStreams(api, app, config);
      })
      .then(function () {
        return buildExports.getStreamOrder(api, app, config);
      })
      // pipe all the streams together in the specified order
      .map(function (streamId) {
        if (!streamId) { return; }

        buildStream = buildStream.pipe((api.streams.get(streamId) || api.streams.create(streamId))
          .on('end', function () {
            logger.log(streamId, 'complete');
          })
          .on('error', function (err) {
            // showStack indicates this is a devkit build exception
            if (err.showStack !== undefined) {
              throw err;
            } else {
              logger.error(err);
              logger.log('Unexpected error in stream', streamId);

              var wrappedError = new BuildError('error in ' + streamId + ' stream');
              wrappedError.originalError = err;
              throw wrappedError;
            }
          }));
      })
      // add a final sink so the last pipe has something draining it
      .then(function () {
        var sink = new FileSink();
        buildStream.pipe(sink);
        return sink.onFinish.then(function (files) {
          api.build.addResult('files', files);
        });
      })
      .then(function () {
        // build result
        return api.build.getResults();
      })
      .nodeify(cb);
  };
};

// token to return from onFile callbacks if the file should be removed
var REMOVE_FILE = {};

// adds stream api functions to the api object
exports.getStreamAPI = function (api, app, config) {

  var logger = api.logging.get(config.target);

  // devkit < 3.1 incorrectly passed the raw app object rather than the public
  // api -- just call toJSON to get the object we expect
  if (!app.modules) {
    app = app.toJSON();
  }

  var allStreams = {};
  var createFileStream = require('./common/createFileStream').bind(null, api, app, config);

  return {
    get: function (id) {
      return allStreams[id];
    },
    remove: function (id) {
      delete allStreams[id];
    },
    removeAll: function () {
      allStreams = {};
    },
    create: function (id, opts) {
      var stream;
      switch (id) {
        case 'spriter':
          stream = require('./common/spriter').sprite(api, config);
          break;
        case 'inline-cache':
          stream = require('./common/inlineCache').create(api);
          break;
        case 'app-js':
          stream = require('./common/appJS').create(api, app, config, opts);
          break;
        case 'fonts':
          stream = require('./common/fontStream').create(api, config);
          break;
        case 'html':
          stream = require('./common/html').create(api, app, config, opts);
          break;
        case 'static-files':
          stream = require('./common/static-files').create(api, app, config);
          break;
        case 'image-compress':
          stream = require('./common/image-compress').create(api, app, config);
          break;
        case 'log':
          stream = createFileStream({
            onFile: function (file) {
              logger.log(file.path);
            }
          });
          break;
        case 'src':
          stream = resources.createFileStream(api, app, config, config.outputResourcePath);
          break;
        case 'write-files':
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

    // convenience wrapper - takes a function and runs it as part of the build
    // stream (when the previous stream ends)
    registerFunction: function (id, func) {
      allStreams[id] = createFileStream({
        onFinish: func
      });

      return this;
    },

    createFileStream: createFileStream,

    REMOVE_FILE: REMOVE_FILE
  };
};

/**
 * Provides a simple API for components of the build process to interact with
 * other components
 */
exports.getBuildAPI = function (api, app, config) {
  var _results = {
    config: config
  };

  return {
    // stores a build result
    addResult: function (key, value) {
      _results[key] = value;
    },

    getResult: function (key) {
      return _results[key];
    },

    // returns the results that are passed out of the build
    getResults: function () {
      return _results;
    },

    // helps build targets wrap other build targets by executing a specific
    // build target
    execute: function (buildTarget, targetConfig) {
      if (!targetConfig) {
        targetConfig = JSON.parse(JSON.stringify(config));
      }

      return buildTarget.configure(api, app, targetConfig)
        .then(function () {
          return buildTarget.build(api, app, targetConfig);
        });
    }
  };
};

function FileSink() {
  EventEmitter.call(this);

  this.onFinish = new Promise(function (resolve, reject) {
    this._resolve = resolve;
    this.on('error', reject);
  }.bind(this));

  this._files = [];
  this.writable = true;
}

util.inherits(FileSink, EventEmitter);

FileSink.prototype.write = function write(file, encoding, cb) {
  this._files.push(file.relative);
  if (cb) { process.nextTick(cb); }
  return true;
};

FileSink.prototype.end = function () {
  this.emit('finish');
  this._resolve(this._files);
  return true;
};
