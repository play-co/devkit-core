var Promise = require('bluebird');
var JSCompiler = require('../jsCompiler').JSCompiler;
var JSConfig = require('../jsConfig').JSConfig;

exports.initialImports = {
  'native': 'devkit.native.launchClient',
  'browser': 'devkit.browser.launchClient'
};

exports.create = function (api, app, config, opts) {

  var imports = [config.initialImport || exports.initialImports[opts.env]]
    .concat(config.imports);

  var jsConfig = new JSConfig(api, app, config);
  var jsCompiler = new JSCompiler(api, app, config, jsConfig);
  var compileJS = Promise.promisify(jsCompiler.compile, jsCompiler);

  var inlineCache;
  if (opts.inlineCache) {
    inlineCache = api.streams.create('inline-cache');
  }

  var compileAppJS = compileJS({
        env: opts.env,
        initialImport: imports.join(', '),
        appendImport: false,
        includeJsio: !config.excludeJsio,
        debug: config.scheme === 'debug',
        preCompress: config.preCompressCallback
      });

  var stream = api.streams.createStreamWrapper()
    .wrap(inlineCache)
    .wrap(api.streams.createFileStream({
      onFinish: function (addFile) {
        return Promise.all(opts.tasks)
          .then(function (tasks) {
            addFile({
              filename: opts.filename,
              contents: compileAppJS
                .then(function (js) {
                  return opts.composite(tasks, js, inlineCache, jsConfig);
                })
            });
          });
      }
    }));

  stream.config = jsConfig;
  stream.getOpts = function () { return opts; };
  return stream;
};

