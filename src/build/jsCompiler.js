'use strict';
var path = require('path');
var crypto = require('crypto');
var EventEmitter = require('events').EventEmitter;

var argv = require('optimist').argv;
var mkdirp = require('mkdirp');
var tempfile = require('tempfile');

var jsioWebpack = require('jsio-webpack');

// clone to modify the path for this jsio but not any others
var jsio = require('jsio').clone();

var uglify = require('uglify-js');

var fs = require('./util/fs');
const webpackWatchers = require('./webpack/webpackWatchers');
const jsCompilerUtils = require('./jsCompilerUtils');

var logger;
var compressLog;


const WP_OUTPUT_DIR = tempfile();


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
      jsCompilerUtils.addClientPaths(this._path, this._pathCache, config.clientPaths);
    }

    if (app && app.clientPaths) {
      jsCompilerUtils.addClientPaths(this._path, this._pathCache, app.clientPaths);
    }
  };

  this.compile = function (opts, cb) {
    opts = merge({}, opts, this._opts);

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

    // var importStatement = 'import ' + opts.initialImport;
    // logger.log('compiling', importStatement);

    // if (opts.scheme == 'debug') {
    //   importStatement += ', util.syntax';
    // }

    // var _jsio = jsio.clone();
    // _jsio.path.add(path.join(_jsio.__env.getPath(), '..', 'compilers'));
    // var compiler = _jsio('import jsio_compile.compiler');

    // for debugging purposes, build the equivalent command that can be executed
    // from the command-line (not used for anything other than logging to the screen)
    // var cmd = ['jsio_compile', JSON.stringify(importStatement)];
    // for (let key in jsioOpts) {
    //   cmd.push('--' + key);

    //   var value = JSON.stringify(jsioOpts[key]);
    //   if (typeof jsioOpts[key] !== 'string') {
    //     value = JSON.stringify(value);
    //   }
    //   cmd.push(value);
    // }

    // logger.log(cmd.join(' '));

    // The DevKitJsioInterface implements platform-specific functions that the js.io
    // compiler needs like basic control flow and compression.  It's really more
    // like a controller that conforms to the js.io-compiler's (controller) interface.
    // jsioOpts.interface = new DevKitJsioInterface(this)
    //   .on('error', cb)
    //   .on('code', function (code) {
    //     cb && cb(null, code);
    //   });

    jsioOpts.preCompress = opts.preCompress; // this.precompress.bind(this);

    // start the compile by passing something equivalent to argv (first argument is
    // ignored, but traditionally should be the name of the executable?)

    const mapPath = (p) => {
      if (path.isAbsolute(p)) {
        return p;
      }
      return path.resolve(jsioOpts.cwd, p);
    };

    // Random dir
    // const wpOutputDir = path.join(
    //   WP_OUTPUT_DIR,
    //   jsioOpts.cwd.replace(new RegExp(path.sep, 'g'), '_')
    // );
    const wpOutputDir = path.join(jsioOpts.cwd, 'dist');
    if (!fs.existsSync(wpOutputDir)) {
      mkdirp.sync(wpOutputDir);
    }

    const jsioWebpackConfig = {
      configure: (configurator, options) => {
        const entry = {
          app: path.resolve(jsioOpts.cwd, 'src', 'Application')
        };
        // TODO: this is sort of hacky, this whole config generation should probably
        // be moved in to jsio-webpack sooner than later.
        const testIndexPath = path.resolve(jsioOpts.cwd, 'tests', 'index.js');
        if (
          process.env.CI === 'true'
          && fs.existsSync(testIndexPath)
        ) {
          console.log('> Adding test entry');
          entry.tests = testIndexPath;
        }

        configurator.merge({
          entry: entry,
          output: {
            filename: '[name].js',
            path: wpOutputDir,
            publicPath: '/'
          }
        });

        options.useCircularDependencyPlugin = true;
        // TODO: turn this on and remove the postConfigure aliases
        // options.useModuleAliases = true;
        options.useGitRevisionPlugin = 'production';
        // options.useVisualizerPlugin = true;

        return configurator;
      },
      postConfigure: (configurator, options) => {
        configurator.removePreLoader('eslint');

        configurator.loader('xml', (current) => {
          current.test = /\.(xml|fnt)$/;
          return current;
        });

        configurator.loader('ts', (current) => {
          current.exclude = null;
          return current;
        });

        configurator.loader('babel', current => {
          current.exclude = null;
          return current;
        });

        // Some shims
        configurator.merge({
          resolve: {
            alias: {
              child_process: path.resolve(__dirname, 'shim', 'empty.js')
            }
          }
        });

        configurator.merge(current => {
          // Keep jsio-webpack last on root list (so that game files are resolved ahead of it)
          const gameRoot = path.resolve(jsioOpts.cwd);
          const gameNodeModules = path.join(gameRoot, 'node_modules');
          const jsioWebpackRoot = path.resolve(__dirname, '..', '..', 'node_modules', 'jsio-webpack');
          const jsioWebpackNodeModules = path.join(jsioWebpackRoot, 'node_modules');

          const paths = jsioOpts.path.map(mapPath);
          current.resolve.root = [].concat(paths);

          current.resolve.alias = current.resolve.alias || {};
          for (var pathCacheKey in jsioOpts.pathCache) {
            current.resolve.alias[pathCacheKey] = mapPath(jsioOpts.pathCache[pathCacheKey]);
          }

          // This should be per platform (depending on build type)
          current.resolve.alias.timestepInit = path.resolve(
            __dirname, '..', 'clientapi', 'browser'
          );

          current.resolve.root.push(path.resolve(
            __dirname, '..', '..', 'modules', 'timestep'
          ));

          current.resolve.root.push(gameNodeModules);
          current.resolve.root.push(jsioWebpackNodeModules);

          // current.resolve.alias.jsio = path.dirname(require.resolve('jsio'));
          current.resolve.alias.jsio = path.resolve(
            path.dirname(require.resolve('jsio')),
            'jsio-web'
          );

          current.resolve.alias.devkitCore = path.resolve(__dirname, '..');

          if (process.env.NODE_ENV === 'production') {
            current.devtool = null;
            current.output.pathinfo = false;
          } else {
            // original code, no breakpoints
            // current.devtool = 'cheap-module-eval-source-map';
            // transformed code, no breakpoints
            // current.devtool = 'cheap-eval-source-map';
            // bundle, yes breakpoints
            // current.devtool = 'cheap-source-map';
            // original code, no breakpoints
            // current.devtool = 'eval-source-map';
            // current.devtool = 'source-map';
            // current.devtool = null;
            // transformed code, yes breakpoints
            current.devtool = 'eval';
            current.output.pathinfo = true;
          }

          return current;
        });
      }
    };

    // This will only be set for simulator builds
    const inSimulator = !!this._opts.simulator.deviceId;

    mkdirp(jsCachePath, () => {
      const outputPath = path.join(wpOutputDir, 'app.js');

      const onCompileComplete = (err, stats) => {
        // Show the last webpack output
        jsioWebpack.compilerLogger(err, stats);

        if (err) {
          cb(err);
          return;
        }

        if (!fs.existsSync(outputPath)) {
          cb(new Error('Webpack output missing: ' + outputPath));
          return;
        }

        const code = fs.readFileSync(outputPath, 'utf-8');
        cb(null, code);
      };

      if (inSimulator) {
        webpackWatchers.getWatcher(
          this._app.id,
          logger,
          jsioWebpackConfig
        )
          .then((watcher) => {
            watcher.waitForBuild(onCompileComplete);
          });
      } else {
        webpackWatchers.getCompiler(jsioWebpackConfig)
          .then((compiler) => {
            compiler.run(onCompileComplete);
          });
      }
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
        cb({ 'code': err.code }, src);
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
          fs.readFile(cachePath, 'utf8', function (err, cachedContents) {
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
        } catch (e) {
          compressLog.error(e);
        }
      }

      bridge.strip(src, opts, function (err, src) {
        cb(src);
      });
    }
  };
});


