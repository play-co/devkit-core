var exec = require('child_process').exec;
var ff = require('ff');
var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
var printf = require('printf');
var etags = require('etags');

var Resource = Class(function () {
  this.init = function (opts) {
    this.target = opts.target;
    this.copyFrom = opts.copyFrom;

    if ('contents' in opts) {
      this.contents = opts.contents;
    }
  }
});

exports.ResourceList = Class(function () {
  this.init = function () {
    this._resources = [];
  }

  this.add = function (opts) {
    this._resources.push(new Resource(opts));
  }

  this.write = function (targetDirectory, appPath, cb) {
    new Writer(this._resources.slice(0), targetDirectory, appPath)
      .write(cb);
  }

  this.getHashes = function (targetDirectory, appPath, cb) {
    var f = ff(function () {
      var hashes = {};
      f(hashes);

      this._resources.forEach(function (res) {
        var next = f.waitPlain();
        var targetPath = path.join(this._targetDirectory, res.target);
        etags.hash(targetPath, function (err, md5) {
          if (!err) {
            hashes[targetPath] = md5;
          }
          next();
        });
      });
    }).cb(cb);
  }
});

var Writer = Class(function () {
  this.init = function (resources, targetDirectory, appPath) {
    this._resources = resources;
    this._targetDirectory = targetDirectory;
    this._appPath = appPath;
  }

  this.write = function (cb) {
    this._onFinish = cb;
    this._writeNext();
  }

  this._writeNext = function () {
    var res = this._resources.shift();
    if (!res) {
      return this._onFinish();
    }

    var cb = function (err) {
      if (err) {
        console.error(err);
        this._onFinish(err);
      } else {
        console.log('wrote', res.target);
        this._writeNext();
      }
    }.bind(this);

    var targetFile = path.join(this._targetDirectory, res.target);
    mkdirp(path.dirname(targetFile), function (err) {
      if (err) { return cb(err); }

      if ('contents' in res) {
        fs.writeFile(targetFile, res.contents, cb);
      } else if (res.copyFrom && res.copyFrom != targetFile) {
        var cmd = printf('cp -p "%(src)s" "%(dest)s"', {
          src: res.copyFrom,
          dest: targetFile
        });

        exec(cmd, {cwd: this._appPath}, function (err, stdout, stderr) {
          if (err && err.code != 1) {
            console.log(JSON.stringify(code));
            cb(new Error('code ' + code + '\n' + stdout + '\n' + stderr));
          } else {
            cb();
          }
        });
      } else {
        cb();
      }
    });
  }
});
