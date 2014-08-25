var fs = require('fs');
var ff = require('ff');
var crypto = require('crypto');
var path = require('path');
var File = require('./File');

// utility function to replace any windows path separators for paths that
// will be used for URLs
var regexSlash = /\\/g;
function useURISlashes (str) { return str.replace(regexSlash, "/"); }

exports.spriteDirectory = function (api, config, directories, cb) {
  var logger = api.logging.get('spriter');

  var f = ff(function () {
    var md5sum = crypto.createHash('md5');
    md5sum.update(directories.src);
    var hash = md5sum.digest('hex');

    var cmd = {
      tool: "spriter",
      args: [
        "--no-clean", // don't remove unused spritesheets, since we might be spriting multiple source directories into the same target
        "--cache-file", "spritercache-" + hash,
        "--scale", 1,
        "--dir", directories.src + "/",
        "--output", directories.spritesheets,
        "--target", config.target,
        "--binaries", api.paths.lib,
        "--is-simulator", config.isSimulated,
        "--spriter-png-fallback", !!(config.argv && config.argv['spriter-png-fallback'])
      ],
      buffer: true
    };

    logger.log("spriter", cmd.args.map(function (arg) { return /^--/.test(arg) ? arg : '"' + arg + '"'; })
        .join(' '));

    // forwards `[code, out, err]`
    //   - a non-zero `code` is the error, causing build to stop
    //   - `out` is the stdout of the tool
    //   - `err` is the stderr of the tool, but it's printed (config.print == true) so we ignore it
    api.jvmtools.exec(cmd, f());
  }, function (rawSpriterOutput) {
    try {
      var spriterOutput = JSON.parse(rawSpriterOutput);
    } catch (e) {
      logger.error(rawSpriterOutput);
      throw e;
    }

    // If the spriter gives an error, display it and end the process
    if (spriterOutput.error) {
      formatter.error(spriterOutput.error);
      process.exit(0);
    }

    var files = {};

    files.spritesheets = spriterOutput.sprites.map(function (filename) {
      var ext = path.extname(filename);
      return new File({
        fullPath: path.resolve(directories.spritesheets, filename),
        target: path.join(directories.spritesheetsTarget, filename)
      });
    });

    var filteredPaths = [];

    files.other = spriterOutput.other.map(function (filename) {
      var fullPath = path.resolve(directories.src, filename);

      if (path.basename(filename) === "metadata.json") {
        try {
          var filedata = fs.readFileSync(fullPath, "utf8");
          var fileobj = JSON.parse(filedata);
          if (fileobj.package === false) {
            var filterPath = path.dirname(fullPath);
            logger.log("Not packaging files from", filterPath);
            filteredPaths.push(filterPath);
          }
        } catch (ex) {
          logger.error("WARNING:", filename, "format is not valid JSON so cannot parse it.");
        }
      }

      return new File({
        fullPath: fullPath,
        target: path.join(directories.target, filename)
      });
    });

    // remove paths that have metadata package:false
    for (var i = 0; i < files.other.length; ++i) {
      var file = files.other[i];
      if (path.basename(file.target) === "metadata.json") {
        files.other.splice(i--, 1);
        continue;
      }

      for (var fp in filteredPaths) {
        if (filename.indexOf(fp) == 0) {
          files.other.splice(i--, 1);
          break;
        }
      }
    }

    f(files);
    var mapPath = path.resolve(directories.spritesheets, spriterOutput.map);
    fs.readFile(mapPath, "utf8", f());

  }, function (files, mapContents) {
    // rewrite JSON data, fixing slashes and appending the spritesheet directory
    var rawMap = JSON.parse(mapContents);
    var imageMap = {};
    Object.keys(files.other).forEach(function (key) {
      var target = files.other[key].target;
      if (target) {
        imageMap[target] = {};
      }
    });
    Object.keys(rawMap).forEach(function (key) {
      if (rawMap[key].sheet) {
        rawMap[key].sheet = useURISlashes(path.join(directories.spritesheetsTarget, rawMap[key].sheet));
      }

      imageMap[useURISlashes(path.join(directories.target, key))] = rawMap[key];
    });

    if (typeof config.mapMutator === "function") {
      config.mapMutator(imageMap);
    }

    files.imageMap = imageMap;

    // pass along the files
    f(files);
  })
  .cb(cb);
}
