var path = require('path');

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

exports.configure = function (api, app, config, cb) {
  logger = api.logging.get('build-native');

  // add in any common config keys
  require('../common/config').extend(app, config);

  var argv = exports.opts.argv;

  config.repack = argv.repack;
  config.open = argv.open;
  config.reveal = argv.reveal;
  config.archiveBrowserBuild = argv.browser;
  config.provisionPath = argv.provision;
  config.signingIdentity = argv.developer;
  config.enableLogging = !argv.debug && argv.enableReleaseLogging;
  config.powerOfTwoSheets = true;

  cb && cb();
};

// returns an archive with a patched finalize function that calls the original
// finalize and then returns a Promise that resolves when the write stream
// closes or rejects on errors
function createArchive(archivePath) {
  var archiver = require('archiver');
  var archive = archiver.create('zip', {});
  var fs = require('fs-extra');
  var output = fs.createWriteStream(archivePath);
  archive.pipe(output);

  var onFinish = new Promise(function (resolve, reject) {
    output.on('finish', resolve);
    output.on('error', reject);
    archive.on('error', reject);
  });

  var finalize = archive.finalize;
  archive.finalize = function () {
    finalize.apply(this, arguments);
    return onFinish;
  };

  return archive;
}

// takes a app, subtarget(android/ios), additional opts.
exports.build = function (api, app, config, cb) {
  logger = api.logging.get('build-native');

  var fs = require('fs-extra');
  var glob = Promise.promisify(require('glob'));
  var readFile = Promise.promisify(fs.readFile);
  var stat = Promise.promisify(fs.stat);

  var outPath = config.outputResourcePath;
  if (exports.opts.argv.clean) {
    fs.removeSync(outPath);
    fs.mkdirsSync(outPath);
  }

  var archive;
  var archiveName = app.manifest.shortName + '.zip';

  require('./resources')
    .writeNativeResources(api, app, config)
    .then(function (buildResult) {
      if (config.archiveBrowserBuild) {
        var browserBuilder = require('../browser/');
        config.target = 'browser-mobile';
        return browserBuilder
          .configure(api, app, config)
          .then(function () {
            config.spritesheets = buildResult.spritesheets;
            return browserBuilder.build(api, app, config);
          });
      }
    })
    .then(function () {
      var archivePath = path.join(outPath, archiveName);

      archive = createArchive(archivePath);

      // Find files in the output directory
      return glob(path.join(outPath, '**', '*'));
    })
    .call('sort', function(a, b) {
      return a.localeCompare(b);
    })
    .each(function (file) {
      var zipPath = file.replace(outPath + path.sep, '');
      // Skip any existing archive file
      if (zipPath === archiveName) {
        return;
      }

      return stat(file)
        .then(function (stats) {
          if (stats.isDirectory()) {
            archive.append(new Buffer(0), {name: zipPath + '/'});
            return;
          }

          return readFile(file)
            .then(function (buffer) {
              archive.append(buffer, {name: zipPath});
            });
        });
    })
    .then(function () {
      return archive.finalize();
    })
    .nodeify(cb);
};
