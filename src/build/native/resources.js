var fs = require('fs');
var ff = require('ff');
var path = require('path');
var mkdirp = require('mkdirp');

/**
 * Packaging for Native.
 * Native on any platform requires a compiled JavaScript file, so we make this
 * generic and include it here.
 */

var INITIAL_IMPORT = 'devkit.native.launchClient';

// Write out native javascript, generating a cache and config object.

function filterCopyFile(ios, file) {
  if (!/\.js$/.test(file) && !/\.json$/.test(file)) {
    // If iOS,
    if (ios) {
      if (/\.ogg$/.test(file)) {
        return "ignore";
      }
    } else { // Else on Android or other platform that supports .ogg:
      // If it is MP3,
      if (/\.mp3$/.test(file) && fs.existsSync(file.substr(0, file.length - 4) + ".ogg")) {
        return "ignore";
      } else if (/\.ogg$/.test(file)) {
        return "renameMP3";
      }
    }

    return null;
  }

  return "ignore";
}

exports.writeNativeResources = function (api, app, config, cb) {
  logger.log("Writing resources for " + config.appID + " with target " + config.target);

  var cache = {};

  // TODO: remove the mapMutator API
  config.mapMutator = function(imageMap) {
    var deleteList = [], renameList = [];

    for (var key in imageMap) {
      switch (filterCopyFile(config.isIOS, key)) {
      case "ignore":
        deleteList.push(key);
        break;
      case "renameMP3":
        renameList.push(key);
        break;
      }
    }

    for (var ii = 0; ii < deleteList.length; ++ii) {
      var key = deleteList[ii];

      delete imageMap[key];
    }

    for (var ii = 0; ii < renameList.length; ++ii) {
      var key = renameList[ii];
      var mutatedKey = key.substr(0, key.length - 4) + ".mp3";

      imageMap[mutatedKey] = imageMap[key];
      imageMap[key] = undefined;
    }
  };

  var JSConfig = require('../common/jsConfig').JSConfig;
  var JSCompiler = require('../common/jsCompiler').JSCompiler;
  var InlineCache = require('../common/inlineCache').InlineCache;

  var jsConfig = new JSConfig(api, app, config);
  var resourceList = new (require('../common/resources').ResourceList);
  var jsCompiler = new JSCompiler(api, app, config, jsConfig);
  var inlineCache = new InlineCache();

  var f = ff(function () {

    require('../common/packager').getFiles(api, app, config, f());
    // build.packager.compileResources(app, config, INITIAL_IMPORT, f());

    jsCompiler.compile({
      env: 'native',
      initialImport: INITIAL_IMPORT,
      appendImport: false,
      includeJsio: !config.excludeJsio,
      debug: config.scheme == 'debug'
    }, f());

  }, function (files, jsSrc) {
    f(jsSrc);

    function embedFile (info) {
      // TODO: fix native android ogg/mp3 file support

      // note: ignores all js/json files
      var filter = filterCopyFile(config.isIOS, info.target);
      if (filter != 'ignore') {
        if (filter == "renameMP3") {
          info.target = info.target.substr(0, info.target.length - 4) + ".mp3";
        }

        logger.log("Writing resource:", info.target);
        if (/ttf$/.test(info.target)) {
          info.target = path.join('resources', 'fonts', path.basename(info.target));
        }
        resourceList.add({
          target: info.target,
          copyFrom: info.fullPath
        });
      }
    }

    files.images.forEach(embedFile);
    files.other.forEach(embedFile);

    inlineCache.addFiles(files.other, f.wait());

    resourceList.add({
      target: "manifest.json",
      contents: JSON.stringify(app.manifest)
    });

    fs.readFile(path.join(__dirname, "env.js"), 'utf8', f());

    resourceList.writeSourceMap(config.outputPath, files.imageSourceMap, f.wait());
  }, function (gameJS, nativeEnv) {
    resourceList.add({
      target: 'native.js',
      contents: jsConfig.toString()
        + ';CACHE=' + JSON.stringify(inlineCache) + ';\n'
        + nativeEnv + ';'
        + gameJS + ';'
    });

    logger.log('writing files to', config.outputResourcePath);

    resourceList.write(config.outputResourcePath, app.paths.root, f());
  }, function () {
    if (config.isTestApp) {
      resourceList.getHashes(f());
    }
  }, function (hashes) {
    if (hashes) {
      var resourceHashFile = path.join(config.outputResourcePath, 'resource_list.json');
      logger.log("Writing file list to " + resourceHashFile);
      fs.writeFile(resourceHashFile, JSON.stringify(hashes), f());
    }
  }).cb(cb);
}
