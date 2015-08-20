var JSCompiler = require('../common/jsCompiler').JSCompiler;
var JSConfig = require('../common/jsConfig').JSConfig;

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
    inlineCache = api.streams.get('inline-cache');
  }

  // we need a better api for wrapping streams, but we can just reuse the inline
  // cache stream for now
  var appJSStream = inlineCache;
  var compileAppJS = compileJS({
        env: opts.env,
        initialImport: imports.join(', '),
        appendImport: false,
        includeJsio: !config.excludeJsio,
        debug: config.scheme === 'debug',
        preCompress: config.preCompressCallback
      });

  appJSStream.onEnd = function (addFile, cb) {
    Promise.all(opts.tasks)
      .then(function (tasks) {
        return compileAppJS
          .then(function (js) {
            return opts.composite(tasks, js, inlineCache, jsConfig);
          })
          .then(function (contents) {
            addFile(opts.filename, contents);
          });
      })
      .nodeify(cb);
  };

  appJSStream.config = jsConfig;

  return appJSStream;
};
