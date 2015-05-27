var fs = require('fs');
var path = require('path');
var File = require('vinyl');
var readFile = Promise.promisify(fs.readFile);
var slash = require('slash');
var vfs = require('vinyl-fs');
var streamFromArray = require('stream-from-array');

// Packaging for Native.
// Native on any platform requires a compiled JavaScript file, so we make this
// generic and include it here.

var INITIAL_IMPORT = 'devkit.native.launchClient';

var FONT_EXTS = {
  '.ttf': true,
  '.eot': true,
  '.woff': true
};

exports.writeNativeResources = function (api, app, config, cb) {
  var logger = api.logging.get('native-resources');
  logger.log('Writing resources for', config.appID,
             'with target', config.target);

  var baseDirectory = config.outputResourcePath;

  var JSConfig = require('../common/jsConfig').JSConfig;
  var JSCompiler = require('../common/jsCompiler').JSCompiler;
  var sprite = require('../common/spriter')
                            .sprite
                            .bind(null, api, app, config);

  var jsConfig = new JSConfig(api, app, config);
  var resources = require('../common/resources');
  var jsCompiler = new JSCompiler(api, app, config, jsConfig);

  var compileJS = Promise.promisify(jsCompiler.compile, jsCompiler);

  resources.getDirectories(api, app, config)
    .then(function (directories) {
      return Promise.all([
        resources.getFiles(baseDirectory, directories),
        config.spriteImages && sprite(directories),
        compileJS({
          env: 'native',
          initialImport: [INITIAL_IMPORT].concat(config.imports).join(', '),
          appendImport: false,
          includeJsio: !config.excludeJsio,
          debug: config.scheme === 'debug'
        }),
        readFile(path.join(__dirname, 'env.js'), 'utf8')
      ]).spread(function (files, spriterResult, js, envJS) {
        var sourceMap = {};
        if (spriterResult) {
          // remove sprited files from file list
          files = files.filter(function (file) {
            return !(file.originalRelativePath in spriterResult.sourceMap);
          });

          files = files.concat(spriterResult.files);
          sourceMap = merge(sourceMap, spriterResult.sourceMap);
        }

        // move all font files to resources/fonts
        for (var file in files) {
          var filename = path.basename(file.path);
          var ext = path.extname(file.path);
          if (ext in FONT_EXTS) {
            file.path = path.join(file.base, 'resources', 'fonts', filename);
          }
        }

        var InlineCache = require('../common/inlineCache').InlineCache;
        var inlineCache = new InlineCache();
        var addToInlineCache = inlineCache.add.bind(inlineCache);
        return Promise.resolve(files)
          .filter(addToInlineCache)
          .then(function (files) {
            files.forEach(function (file) {
              if (file.history.length > 1) {
                sourceMap[slash(file.relative)] = file.history[0];
              }
            });

            files.push(new File({
              base: baseDirectory,
              path: path.join(baseDirectory, 'manifest.json'),
              contents: new Buffer(JSON.stringify(app.manifest))
            }));

            files.push(new File({
              base: baseDirectory,
              path: path.join(baseDirectory, 'native.js'),
              contents: new Buffer(jsConfig.toString()
                                + ';CACHE=' + JSON.stringify(inlineCache)
                                + ';\n'
                                + envJS + ';\n'
                                + js + ';')
            }));

            files.push(new File({
              base: baseDirectory,
              path: path.join(baseDirectory, 'resource_source_map.json'),
              contents: new Buffer(JSON.stringify(sourceMap))
            }));

            logger.log('writing files to', config.outputResourcePath);
            return new Promise(function (resolve, reject) {
              streamFromArray.obj(files)
                .pipe(vfs.dest(baseDirectory))
                .on('end', resolve)
                .on('error', reject);
            });
          });
      }).nodeify(cb);
    });
};
