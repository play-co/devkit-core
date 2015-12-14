var path = require('path');
var Promise = require('bluebird');
var createBuildTarget = require('../../index').createBuildTarget;

exports.opts = require('optimist')(process.argv)
    .alias('help',  'h').describe('help', 'Display this help menu')

    .alias('debug', 'd').describe('debug', 'Create debug build')
                        .boolean('debug')
                        .default('debug', true)

    .alias('browser', 'b').describe('browser', 'Include browser html/js')
                        .boolean('browser')
                        .default('browser', false)

    .alias('clean', 'c').describe('clean', 'Clean build before compilation')
                        .boolean('clean')
                        .default('clean', false);

createBuildTarget(exports);

exports.init = function (api, app, config) {
  logger = api.logging.get('build-native');

  var argv = exports.opts.argv;
  config.repack = argv.repack;
  config.open = argv.open;
  config.reveal = argv.reveal;
  config.archiveBrowserBuild = argv.browser;
  config.provisionPath = argv.provision;
  config.signingIdentity = argv.developer;
  config.enableLogging = !argv.debug && argv.enableReleaseLogging;
  config.powerOfTwoSheets = true;

  // TODO: move this
  var outPath = config.outputResourcePath;
  if (exports.opts.argv.clean) {
    var fs = require('fs');
    fs.removeSync(outPath);
    fs.mkdirsSync(outPath);
  }
};

// returns an stream that archives all the files in the build stream
function createArchiveStream(api, app, config) {
  var archiver = require('archiver');
  var fs = require('../../util/fs');

  var _files = [];
  var _dirs = {};
  var _fileHash = {};
  return api.streams.createFileStream({
    onFile: function (file) {
      if (!_fileHash[file.path]) {
        _fileHash[file.path] = true;

        var zipPath = file.path.replace(config.outputPath + path.sep, '');
        zipPath.replace(/\//g, function (match, index) {
          var dir = zipPath.substring(0, index + 1);
          _dirs[dir] = true;
        });

        _files.push({
          filename: file.path,
          zipPath: zipPath,
          stream: fs.createReadStream(file.path)
        });
      }
    },
    onFinish: function () {
      _files.sort(function (a, b) {
        return a.filename.localeCompare(b.filename);
      });

      var filename = app.manifest.shortName + '.zip';
      var archivePath = path.join(config.outputPath, filename);
      var archive = archiver.create('zip', {});
      var output = fs.createWriteStream(archivePath);
      archive.pipe(output);

      var onFinish = new Promise(function (resolve, reject) {
        output.on('finish', resolve);
        output.on('error', reject);
        archive.on('error', reject);
      });

      var directoryBuffer = new Buffer(0);
      Object.keys(_dirs).forEach(function (dir) {
        archive.append(directoryBuffer, {name: dir});
      });

      _files.forEach(function (file) {
        archive.append(file.stream, {name: file.zipPath});
      });

      archive.finalize();
      return onFinish
        .then(function () {
          logger.log('archive created: ', archivePath);
        });
    }
  });
}

// takes a app, subtarget(android/ios), additional opts.
exports.setupStreams = function (api, app, config) {
  logger = api.logging.get('build-native');

  // inherit the native resources
  require('./native-build').setupStreams(api, app, config);

  if (config.archiveBrowserBuild) {

    // a stream that can run the browser build
    api.streams.register('browser-build', api.streams.createFileStream({
      onFinish: function (addFile) {
        var spritesheets = api.build.getResult('spritesheets');
        var browserBuild = require('../browser');
        var browserConfig = merge({
            target: 'browser-mobile',

            // the spriter will reuse these rather than respriting
            spritesheets: spritesheets
          }, config);

        return api.build.execute(browserBuild, browserConfig)
          .then(function (res) {
            res.files.forEach(function (filename) {
              addFile({filename: filename});
            });
          });
      }
    }));
  }

  api.streams.register('archive', createArchiveStream(api, app, config));
};

exports.getStreamOrder = function (api, app, config) {
  var order = require('./native-build').getStreamOrder(api, app, config);

  if (config.archiveBrowserBuild) {
    order.push('browser-build');
  }

  order.push('archive');

  return order;
};
