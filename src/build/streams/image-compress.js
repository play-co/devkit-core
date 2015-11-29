var path = require('path');
var chalk = require('chalk');
var tempfile = require('tempfile');
var Promise = require('bluebird');
var spawn = require('child_process').spawn;
var Queue = require('promise-queue');
var FilterStream = require('streamfilter');
var fs = require('../util/fs');
var DiskCache = require('../DiskCache');
Queue.configure(Promise);

var exec = Promise.promisify(require('child_process').exec);

var COMPRESS_EXTS = {
  '.png': true,
  '.jpg': true,
  '.gif': true
};

var CACHE_FILENAME = 'image-compress';

var loggedWarning = false;

exports.create = function (api, app, config) {
  var logger = api.logging.get('image-compress');

  var cacheFile = DiskCache.getCacheFilePath(config, CACHE_FILENAME);
  var getCache = DiskCache.load(cacheFile);
  var tempDir = tempfile();

  var filter = new FilterStream(function (file, enc, cb) {
    // remove anything that's not an image
    if (!(file.extname in COMPRESS_EXTS)) {
      return cb(true);
    }

    var isCached = false;

    // remove anything that's cached
    getCache
      .then(function (cache) {
        return cache.get(file.path);
      })
      .then(function (res) {
        isCached = res;
      })
      .finally(function () {
        cb(isCached);
      });
  }, {restore: true, objectMode: true, passthrough: true});

  var stream = api.streams.createStreamWrapper()
    .wrap(filter)
    .wrap(api.streams.createFileStream({
      onFile: function (file) {
        if (file.extname in COMPRESS_EXTS) {
          var opts = file.compress;
          return detectImageMin()
            .then(function () {
              return stream.compressFile(file, opts);
            }, function () {
              if (!loggedWarning) {
                loggedWarning = true;
                logger.warn([
                  'skipping image compression step: ' + chalk.red('devkit-imagemin not found'),
                  '',
                  chalk.blue('To compress images, please first install devkit-imagemin and'),
                  chalk.blue('imagemin-pngquant with npm:'),
                  '',
                  chalk.green('   npm install -g https://github.com/gameclosure/devkit-imagemin'),
                  chalk.green('   npm install -g imagemin-pngquant'),
                  '',
                  chalk.blue('After installing, rerun this release build and devkit will compress'),
                  chalk.blue('images. These are global installs, so you only need to run these'),
                  chalk.blue('once for all DevKit games on your computer.'),
                  '',
                ].join('\n'));
              }
            });
        }
      },
      onFinish: function () {
        return Promise.join(getCache, fs.remove(tempDir), function (cache) {
          return cache.save();
        });
      }
    }))
    .wrap(filter.restore);

  stream.compressFile = function (file, opts) {
    opts = merge({}, opts);

    var initialSize;
    return fs.statAsync(file.path)
      .then(function (stat) {
        initialSize = stat.size;
        var args = [];
        if (opts.format == 'png') {
          if (opts.quantize) {
            args.push('--plugin', 'pngquant');
            delete opts.quantize;
          }
        }

        for (var key in opts) {
          if (key !== 'format') {
            args.push('--' + key, opts[key]);
          }
        }

        var relativePath = path.relative(config.outputResourcePath, file.path);
        args.push(relativePath);

        var outDir = path.join(tempDir, path.dirname(relativePath));
        args.push('-o', outDir);

        var outFile = path.join(tempDir, relativePath);
        return runImageMin(args, config.outputResourcePath, function onStart() {
            logger.log('compressing', file.relative);
          })
          .then(function () {
            return fs.statAsync(outFile);
          })
          .then(function (stat) {
            if (stat.size < initialSize) {
              var savings = Math.round(100 - stat.size / initialSize * 100);
              logger.log('compressed', file.relative, '(' + savings + '% smaller)');
              return fs.moveAsync(outFile, file.path, {clobber: true});
            } else {
              logger.log('compressed', file.relative, '(no reduction)');
            }
          });
      });
  };

  return stream;
};

var _detectImageMin;
function detectImageMin() {
  if (!_detectImageMin) {
    _detectImageMin = exec('command -v devkit-imagemin');
  }

  return _detectImageMin;
}

// simultaneous running minifiers
var MAX_RUNNING = require('../task-queue').DEFAULT_NUM_WORKERS;
var queue = new Queue(MAX_RUNNING);
function runImageMin(args, cwd, onStart) {
  return queue.add(function () {
      return new Promise(function (resolve, reject) {
          onStart();
          var child = spawn('devkit-imagemin', args, {cwd: cwd, stdio: 'inherit'});
          child.on('exit', function (code) {
            if (code) {
              reject(new Error('devkit-imagemin exited with code ' + code));
            } else {
              resolve();
            }
          });
        });
    });
}

