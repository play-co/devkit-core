var path = require('path');
var crypto = require('crypto');

var argv = require('optimist').argv;
var mkdirp = require('mkdirp');
var EventEmitter = require('events').EventEmitter;

// clone to modify the path for this jsio but not any others
var jsio = require('jsio').clone();

var uglify = require('uglify-js');

var fs = require('./util/fs');

var logger;
var compressLog;

exports.JSCompiler = Class(function () {
  this.init = function (api, app, config, jsConfig) {
    logger = api.logging.get('jsio-compile');
    compressLog = api.logging.get('jsio-compile');

    this._api = api;
    this._app = app;
    this._opts = config;
    this._jsConfig = jsConfig;

    this._pathCache = {};
    this._path = [];

    if (config && config.clientPaths) {
      this.addClientPaths(config.clientPaths);
    }

    if (app && app.clientPaths) {
      this.addClientPaths(app.clientPaths);
    }
  };

  this.addClientPaths = function (clientPaths) {
    var pathCache = this._pathCache;
    for (var key in clientPaths) {
      if (key !== '*') {
        pathCache[key] = clientPaths[key];
      } else {
        this._path.push.apply(this._path, clientPaths['*']);
      }
    }
  };

  this.compile = function (opts, cb) {
    var opts = merge({}, opts, this._opts);

    var appPath = this._app.paths.root;
    var jsCachePath = opts.jsCachePath;
    if (!jsCachePath) {
      if (opts.cacheDirectory) {
        jsCachePath = path.join(opts.cacheDirectory, opts.cachePrefix + 'js');
      } else {
        jsCachePath = path.join(appPath, 'build', '.js-cache');
      }
    }

    var jsioOpts = {
      cwd: opts.cwd || appPath,
      environment: opts.env,
      path: [require('jsio').__env.getPath(), '.', 'lib'].concat(this._path),
      includeJsio: 'includeJsio' in opts ? opts.includeJsio : true,
      appendImport: 'appendImport' in opts ? opts.appendImport : false,
      debug: argv.verbose ? 2 : 4,
      pathCache: this._pathCache,
      compressorCachePath: jsCachePath,
      defines: this._jsConfig.getDefines(),
      printOutput: opts.printJSIOCompileOutput,
      gcManifest: path.join(appPath, 'manifest.json'),
      gcDebug: opts.debug,
      preprocessors: ['cls', 'logger']
    };

    if (opts.compress) {
      jsioOpts.compressSources = true;
      jsioOpts.compressResult = true;
    }

    var importStatement = 'import ' + opts.initialImport;
    logger.log('compiling', importStatement);

    if (opts.scheme == 'debug') {
      importStatement += ', util.syntax';
    }

    var _jsio = jsio.clone();
    _jsio.path.add(path.join(_jsio.__env.getPath(), '..', 'compilers'));
    var compiler = _jsio('import jsio_compile.compiler');

    // for debugging purposes, build the equivalent command that can be executed
    // from the command-line (not used for anything other than logging to the screen)
    var cmd = ["jsio_compile", JSON.stringify(importStatement)];
    for (key in jsioOpts) {
      cmd.push('--' + key);

      var value = JSON.stringify(jsioOpts[key]);
      if (typeof jsioOpts[key] !== 'string') {
        value = JSON.stringify(value);
      }
      cmd.push(value);
    }

    logger.log(cmd.join(' '));

    // The DevKitJsioInterface implements platform-specific functions that the js.io
    // compiler needs like basic control flow and compression.  It's really more
    // like a controller that conforms to the js.io-compiler's (controller) interface.
    jsioOpts.interface = new DevKitJsioInterface(this)
      .on('error', cb)
      .on('code', function (code) {
        cb && cb(null, code);
      });

    jsioOpts.preCompress = opts.preCompress;//this.precompress.bind(this);

    // start the compile by passing something equivalent to argv (first argument is
    // ignored, but traditionally should be the name of the executable?)

    mkdirp(jsCachePath, function () {
      compiler.start(['jsio_compile', jsioOpts.cwd || '.', importStatement], jsioOpts);
    });
  };

   /**
    * use the class opts to compress source code directly
    */

  this.strip = function (src, cb) {
    exports.strip(src, this.opts, cb);
  };

  this.compress = function (filename, src, opts, cb) {

    var closureOpts = [
      '--compilation_level', 'SIMPLE_OPTIMIZATIONS',
      '--jscomp_off', 'internetExplorerChecks',
      '--language_in', 'ECMASCRIPT5'
    ];

    this._api.jvmtools.exec({
      tool: 'closure',
      args: closureOpts,
      stdin: src,
      buffer: true
    }, function (err, stdout, stderr) {
      if (stderr) {
        stderr = stderr.replace(/^stdin:(\d+):/mg, 'Line $1:');
        if (stderr.length) {
          var showLog = opts.showWarnings;
          if (showLog === false) {
            var numErrors = stderr.match(/(\d+) error/);
            numErrors = numErrors && numErrors[1];
            if (numErrors > 0) {
              showLog = true;
            }
          }

          if (showLog !== false) {
            compressLog.log(filename + ':\n' + stderr);
          }
        }
      }

      if (!err.code) {
        var compressedSrc = stdout;
        cb(null, compressedSrc);
      } else {
        compressLog.error('exited with code', err.code);
        cb({'code': err.code}, src);
      }
    });
  };

  this.strip = function (src, opts, cb) {
    var defines = {};
    for (var key in opts.defines) {

      var type = 'string';
      if (typeof opts.defines[key] === 'boolean') {
        type = 'name';
      } else if (typeof opts.defines[key] === 'number') {
        type = 'number';
      }

      defines[key] = [type, JSON.stringify(opts.defines[key])];
    }

    try {
      var result = uglify.minify(src, {
        fromString: true,
        global_defs: defines
      });

      cb && cb(null, result.code);
    } catch (e) {
      cb && cb(e);
    }
  };
});

var DevKitJsioInterface = Class(EventEmitter, function () {

  this.init = function (bridge) {
    this._bridge = bridge;
  };

  // interface methods for jsioCompile hooks

  this.setCompiler = function (compiler) {
    this._compiler = compiler;
  };

  this.run = function (args, opts) {
    this._compiler.run(args, opts);
  };

  this.onError = function (e) {
    logger.error(e);
    this.emit('error', e);
  };

  this.onFinish = function (opts, src) {
    this.emit('code', src);
  };

  /**
   * Create a custom compression option.
   */
  this.compress = function (filename, src, opts, cb) {
    var cachePath;
    var bridge = this._bridge;

    if (opts.compressorCachePath && filename) {
      try {
        var cacheFilename = (/^\.\//.test(filename)
                                ? 'R-' + filename.substring(2)
                                : 'A-' + filename)
          .replace(/\.\.\//g, '--U--')
          .replace(/\//g, '---');

        cachePath = path.join(opts.compressorCachePath, cacheFilename);

        var checksum;
        if (crypto) {
          var hash = crypto.createHash('md5');
          hash.update(src);
          checksum = hash.digest('hex');
        } else {
          var stat = fs.statSync(filename);
          checksum = '' + stat.mtime;
        }

        if (fs.existsSync(cachePath)) {
          fs.readFile(cachePath, 'utf8', function(err, cachedContents) {
            if (err) {
              onCacheResult(err, src, true);
            } else {
              var i = cachedContents.indexOf('\n');
              var cachedChecksum = cachedContents.substring(0, i);
              if (checksum === cachedChecksum) {
                // Cache hit!
                onCacheResult(null, cachedContents.substring(i + 1), false);
              } else {
                // File changed, need to compress
                onCacheResult(null, src, true);
              }
            }
          }.bind(this));
        } else {
          onCacheResult(null, src, true);
        }
      } catch (err) {
        onCacheResult(err, src, true);
      }
    } else {
      onCacheResult(null, src, true);
    }

    function onCacheResult(err, src, cacheMiss) {
      if (cacheMiss) {
        if (err === 'cache mismatch') {
          // pass
        } else if (err) {
          compressLog.error(err);
        }

        compressLog.log('compressing JS' + (filename ? ' for ' + filename : '')
            + '...');
        bridge.compress(filename, src, opts, onCompress);
      } else {
        // Set cache path to false so it will not be updated in onCompress()
        cachePath = false;
        onCompress(err, src);
      }
    }

    function onCompress(err, src) {
      if (err) {
        compressLog.error(err);
      } else {
        try {
          if (cachePath && filename) {
            fs.writeFile(cachePath, checksum + '\n' + src);
          }
        } catch(e) {
          compressLog.error(e);
        }
      }

      bridge.strip(src, opts, function (err, src) {
        cb(src);
      });
    }
  };
});


