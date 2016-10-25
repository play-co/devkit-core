'use strict';
const webpack = require('webpack');

const jsioWebpack = require('jsio-webpack');


class Watcher {
  constructor (logger, webpackConfig) {
    this.logger = logger;

    this.compiler = webpack(webpackConfig);
    this.watcher = this.compiler.watch({
      aggregateTimeout: 300 // wait so long for more changes
    }, this._onBuild.bind(this));

    this._buildCallbacks = [];

    this._lastAccessed = (new Date()).getTime();
  }

  _onBuild (err, stats) {
    // Keep track of the last results fo `_applyBuildCallback`
    this._lastBuildResults = [err, stats];

    // Run all callbacks
    this._runAllCallbacks(cb => {
      this._applyBuildCallback(cb);
    });
  }

  _runAllCallbacks (fn) {
    const oldCallbacks = this._buildCallbacks;
    this._buildCallbacks = [];
    oldCallbacks.forEach(fn);
  }

  _applyBuildCallback (cb) {
    if (!this._lastBuildResults) {
      throw new Error('Build results not available yet');
    }
    cb(this._lastBuildResults[0], this._lastBuildResults[1]);
  }

  waitForBuild (cb) {
    this._lastAccessed = (new Date()).getTime();

    // If not running, ready now
    if (!this.watcher.running && this._lastBuildResults) {
      this.logger.log('Watcher: Using last build');
      this._applyBuildCallback(cb);
      return;
    }
    // Otherwise we need to add this to the callback list
    this.logger.log('Watcher: Waiting for next build');
    this._buildCallbacks.push(cb);
  }

  close (cb) {
    // Clear any old listeners
    const err = new Error('Watcher closed');
    this._runAllCallbacks(cb => {
      cb(err);
    });

    // FIXME: this runs, but the process hangs open still.  Why?
    this.watcher.close(cb);
  }
}


const MAX_WATCHERS = 2;
const _watchers = {};


const cleanOldWatchers = () => {
  const keys = Object.keys(_watchers);
  if (keys.length <= MAX_WATCHERS) {
    return;
  }

  // descending by _lastAccessed
  keys.sort((a, b) => {
    return _watchers[b]._lastAccessed - _watchers[a]._lastAccessed;
  });

  for (let i = keys.length - 1; i > MAX_WATCHERS; i--) {
    const key = keys[i];
    _watchers[key].close();
    delete _watchers[key];
  }
};


const getWebpackConfig = (userConfigs) => {
  if (!Array.isArray(userConfigs)) {
    userConfigs = [userConfigs];
  }
  return jsioWebpack.builder.getWebpackConfig(userConfigs);
};


const getWatcher = (id, logger, userConfigs) => {
  logger.log('Getting watcher for: ' + id);
  if (_watchers[id]) {
    logger.log('> Using existing watcher');
    return _watchers[id];
  }

  const webpackConfig = getWebpackConfig(userConfigs);

  logger.log('> Creating new watcher');
  const watcher = new Watcher(logger, webpackConfig);
  _watchers[id] = watcher;
  // Maybe clean up old watchers we dont need anymore
  cleanOldWatchers();
  return watcher;
};


const removeWatcher = (id, cb) => {
  const watcher = _watchers[id];
  if (!watcher) {
    cb(null, false);
    return;
  }

  watcher.close(cb);
  delete _watchers[id];
};


const getCompiler = (userConfigs) => {
  const webpackConfig = getWebpackConfig(userConfigs);
  return webpack(webpackConfig);
};


module.exports = {
  getWatcher: getWatcher,
  removeWatcher: removeWatcher,
  getCompiler: getCompiler
};
