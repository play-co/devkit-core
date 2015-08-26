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
  var logger = api.logging.get('imagemin');

  var cacheFile = DiskCache.getCacheFilePath(config, CACHE_FILENAME);
  var getCache = DiskCache.load(cacheFile);

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
                  'skipping image compression step: ' + chalk.red('imagemin not found'),
                  '',
                  chalk.blue('To compress images, please first install imagemin with npm:'),
                  '',
                  chalk.green('   npm install -g imagemin-cli && npm install -g imagemin-pngquant'),
                  '',
                  chalk.blue('After installing, rerun this release build and devkit will use imagemin to compress images.'),
                  '',
                ].join('\n'));
              }
            });
        }
      },
      onFinish: function () {
        getCache.then(function (cache) {
          cache.save();
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

        args.push(file.path);

        // imagemin-cli expects something that looks like a directory or it will
        // print to stdout instead :(
        var tempDir = tempfile();
        args.push(tempDir);

        var outFile = path.join(tempDir, file.basename);

        return runImageMin(args, outFile, function onStart() {
            logger.log('compressing', file.relative);
          })
          .then(function (stat) {
            if (stat.size < initialSize) {
              var savings = Math.round(100 - stat.size / initialSize * 100);
              logger.log('compressed', file.relative, '(' + savings + '% smaller)');
              return fs.moveAsync(outFile, file.path, {clobber: true});
            } else {
              logger.log('compressed', file.relative, '(no reduction)');
            }
          })
          .then(function () {
            return fs.remove(tempDir);
          });
      });
  };

  return stream;
};

var _detectImageMin;
function detectImageMin() {
  if (!_detectImageMin) {
    _detectImageMin = exec('command -v imagemin');
  }

  return _detectImageMin;
}

// simultaneous running minifiers
var MAX_RUNNING = require('../task-queue').DEFAULT_NUM_WORKERS;
var queue = new Queue(MAX_RUNNING);
function runImageMin(args, outputPath, onStart) {
  return queue.add(function () {
      return new Promise(function (resolve, reject) {
          onStart();
          var child = spawn('imagemin', args, {stdio: 'inherit'});
          child.on('exit', function (code) {
            if (code) {
              reject(new Error('imagemin exited with code ' + code));
            } else {
              resolve();
            }
          });
        })
        .then(function () {
          return fs.statAsync(outputPath);
        });
    });
}

