
var Promise = require('bluebird');
var path = require('path');
var fs = require('../util/fs');

var METADATA_JSON = 'metadata.json';

function nonEmptyFilter(a) { return a; }

var metadataCache = {};
var optionCache = {};

exports.get = function (file) {
  var dirname = path.dirname(file.sourcePath);
  if (!(dirname in optionCache)) {
    // compute all parent directories from file.base to file.path
    var parents = path.dirname(file.sourceRelativePath)
      .split(/[\\\/]/)
      .filter(nonEmptyFilter)
      .reduce(function (parents, current, i) {
        parents.push(path.join(parents[i], current));
        return parents;
      }, [file.sourceDirectory]);

    optionCache[dirname] = Promise.map(parents, function (parent) {
        var filename = path.join(parent, METADATA_JSON);
        if (!(filename in metadataCache)) {
          metadataCache[filename] = loadMetadata(parent, filename);
        }

        return metadataCache[filename];
      })
      .then(function (metadatas) {
        return new Options(dirname, metadatas);
      });
  }

  return Promise.resolve(optionCache[dirname]);
};

function loadMetadata(parent, filename) {
  return fs.readFileAsync(filename)
    .then(function onRead(contents) {
      var value = JSON.parse(contents);
      if (value.rules) {
        value.rules.forEach(function (rule) {
          if (Array.isArray(rule['cond-fileList'])) {
            rule['cond-fileList'] = rule['cond-fileList'].map(function (filename) {
              return path.resolve(parent, filename);
            });
          }
        });
      }

      return value;
    })
    .catch(function onError(err) {
      if (err && err.cause && err.cause.code === 'ENOENT') {
        // file doesn't exist, do nothing
      } else {
        console.error('Unable to read metadata file:', filename, err);
        throw err;
      }
    });
}

exports.Options = Options;

function Options(dirname, metadatas) {
  this.dirname = dirname;
  this.rules = [];
  this.values = {};
  this.ruleCache = {};

  if (metadatas) {
    metadatas.forEach(this.add, this);
  }
}

Options.prototype.add = function (metadata) {
  for (var key in metadata) {
    if (key === 'rules') {
      this.rules.push.apply(this.rules, metadata.rules);
    } else {
      this.values[key] = metadata[key];
    }
  }
};

Options.prototype.get = function (filename, prop, buildOpts) {
  var rules = this.ruleCache[filename];
  if (!rules) {
    rules = Options.filterRules(this.rules, filename, buildOpts);
    this.ruleCache[filename] = rules;
  }

  var n = rules.length;
  for (var i = 0; i < n; ++i) {
    if (prop in rules[i]) {
      return rules[i][prop];
    }
  }

  return this.values[prop];
};

Options.filterRules = function (rules, filename, buildOpts) {
  return rules.filter(function (rule) {
    return (!buildOpts
        || (!rule['cond-buildMode']
          || rule['cond-buildMode'] === buildOpts.scheme)

        && (!rule['cond-target']
          || rule['cond-target'] === buildOpts.target))

      && (!rule['cond-fileList']
          // exact match
          || rule['cond-fileList'].indexOf(filename) >= 0
          // filtered length
          || rule['cond-fileList'].filter(function (match) {
            var n = match.length;
            return match === filename.substring(0, n)
              && (filename[n] == '/' || filename[n] == '\\');
          }).length);
  });
};
