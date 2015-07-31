
var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');

var crypto = require('crypto');

// Only rewrite files if needed

var hashString = function(str) {
  var md5sum = crypto.createHash('md5');
  md5sum.update(str);
  return md5sum.digest('hex');
};

var runGenerator = function(opts, cb) {
  var doWrite = function(err, src) {
    mkdirp(path.dirname(opts.outputPath), function(err) {
      if (err) { cb(err); return; }

      fs.writeFile(opts.outputPath, src, function(err) {
        if (err) { cb(err); return; }

        // For dynamic calls the hash should be that of the input string, not the output file
        if (opts.useInputHash) {
          fs.writeFile(opts.outputHashPath, opts.inputHash, function(err) {
            if (err) { cb(err); return; }
            cb(null, src);
          });
        } else {
          cb(null, src);
        }
      });

    });
  };

  var useOldOutput = function() {
    // Old one is still good, just read it
    fs.readFile(opts.outputPath, 'utf8', function(err, src) {
      if (err) { cb(err); return; }

      cb(null, src);
    });
  }

  var checkModifiedTimes = function() {
    fs.stat(opts.sourcePath, function(err, srcStat) {
      if (err) { cb(err); return; }

      fs.stat(opts.outputPath, function(err, existingStat) {
        if (err) { cb(err); return; }

        if (existingStat.mtime > srcStat.mtime) {
          useOldOutput();
          return;
        }

        opts.generateFn(doWrite);
      });
    });
  };

  var checkInputHash = function() {
    // Cheating: add to opts so we have it inside of doWrite
    opts.useInputHash = true;
    opts.outputHashPath = opts.outputPath + '.hash';
    opts.inputHash = hashString(opts.sourceContents);

    // Get the output hash
    fs.exists(opts.outputHashPath, function(exists) {
      if (exists) {

        // Check the hashes
        fs.readFile(opts.outputHashPath, 'utf-8', function(err, outputHash) {
          if (err) { cb(err); return; }

          if (opts.inputHash === outputHash) {
            useOldOutput();
            return;
          }

          opts.generateFn(doWrite);
        });

      } else {
        opts.generateFn(doWrite);
      }
    });
  };

  // Check if the output exists
  fs.exists(opts.outputPath, function(exists) {
    if (exists) {
      if (opts.sourcePath !== undefined) {
        // It does, check the modified times
        checkModifiedTimes();
      } else if (opts.sourceContents !== undefined) {
        checkInputHash();
      } else {
        throw new Error('unknown input');
      }
    } else {
      opts.generateFn(doWrite);
    }
  });
};


/** take an input file (source), and generate the output with generateFn. finally
run cb with cb(err, src). Will only run generateFn if the output file is older than
the source file */
module.exports = function(source, output, generateFn, cb) {
  // If there is no callback, make it a promise
  var def;
  if (cb === undefined) {
    def = Promise.defer();
    cb = function(err, src) {
      if (err) {
        def.reject(err);
      } else {
        def.resolve(src);
      }
    };
  }

  runGenerator({
    sourcePath: source,
    outputPath: output,
    generateFn: generateFn
  }, cb);

  return def ? def.promise : undefined;
};

module.exports.runGenerator = runGenerator;

/** Use this when the source doesn't live on disk, but is generated dynamically.
Will only run the generateFn if the sourceContents hash does not match the bin output hash */
module.exports.dynamic = function(sourceContents, output, generateFn, cb) {
  var def;
  if (cb === undefined) {
    def = Promise.defer();
    cb = function(err, src) {
      if (err) {
        def.reject(err);
      } else {
        def.resolve(src);
      }
    };
  }

  runGenerator({
    sourceContents: sourceContents,
    outputPath: output,
    generateFn: generateFn || function(cb) { cb(null, sourceContents); }
  }, cb);

  return def ? def.promise : undefined;
};

module.exports.sync = function(source, output, generateFn) {
  if (fs.existsSync(output)) {
    var srcStat = fs.statSync(source);
    var existingStat = fs.statSync(output);
    if (existingStat.mtime > srcStat.mtime) {
      return false;
    }
  }
  var src = generateFn();
  fs.writeFileSync(output, src);

  return src;
};

