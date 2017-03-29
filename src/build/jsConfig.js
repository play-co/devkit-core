'use strict';
const _ = require('lodash');

var setVal = require('./util/obj').setVal;

function deepCopy(obj) { return obj && JSON.parse(JSON.stringify(obj)); }

exports.JSConfig = Class(function () {
  this.init = function (api, app, config) {
    var manifest = app.manifest;

    this._config = {
      appID: manifest.appID,
      android: {
        // TODO: this should become a memory limit heuristic rather than a bool
        enableLowRes: _.get(manifest, 'android.enableLowRes', false),
        // platform specific webGL limits, default of 0 is ignored
        maxTextureMegabytes: _.get(manifest, 'android.webGL.maxTextureMegabytes', 0)
      },
      ios: {
        appleID: manifest.ios && manifest.ios.appleID,
        // TODO: this should become a memory limit heuristic rather than a bool
        enableLowRes: _.get(manifest, 'ios.enableLowRes', false),
        // platform specific webGL limits, default of 0 is ignored
        maxTextureMegabytes: _.get(manifest, 'ios.webGL.maxTextureMegabytes', 0)
      },
      supportedOrientations: deepCopy(manifest.supportedOrientations),
      shortName: manifest.shortName,
      title: manifest.title,
      titles: deepCopy(manifest.titles),
      fonts: deepCopy(manifest.fonts),
      modules: manifest.modules || manifest.addons,
      disableNativeViews: manifest.disableNativeViews || false,
      unlockViewport: manifest.unlockViewport,
      useDOM: !!manifest.useDOM,
      packageName: config.packageName,
      bundleID: config.bundleID,
      scaleDPR: manifest.scaleDPR,
      target: config.target,
      serverName: config.serverName,
      localServerURL: config.serverName == 'local' && config.localServerURL,
      version: config.version || '',
      simulator: config.isSimulated && config.simulator,
      sdkVersion: config.sdkVersion || 'unknown',
      splash: {
        autoHide: !(manifest.splash && manifest.splash.autoHide === false)
      },
      useWebGL: _.get(manifest, 'browser.canvas.useWebGL', false),
      preserveDrawingBuffer: _.get(manifest, 'browser.webGL.preserveDrawingBuffer', true),
      maxTextureMegabytes: _.get(manifest, 'browser.webGL.maxTextureMegabytes', 192),
      disableServiceWorkers: _.get(manifest, 'browser.disableServiceWorkers', false),
      maxTick: _.get(manifest, 'browser.maxTick', 150)
    };

    if (manifest.disableNativeViews) {
      console.warn('low FPS expected: native views disabled');
    }

    this._defines = {
      BUILD_TARGET: config.target,
      BUILD_ENV: {
          'browser-mobile': 'browser',
          'browser-desktop': 'browser',
          'native-bundle': 'native',
          'native-ios': 'native',
          'native-android': 'native'
        }[config.target] || 'browser',
      DEBUG: !!config.debug
    };
  }

  this.define = function (key, value) {
    return this._defines[key] = value;
  }

  this.getDefines = function () { return this._defines; }

  this.add = function (key, value) {
    return this._config[key] = value;
  }

  this.toString = function () {
    var src = [";(function() {var w=window;\n"];
    for (var key in this._defines) {
      src.push("w." + key + "=" + JSON.stringify(this._defines[key]) + ";\n");
    }

    var argv = process.argv;
    var n = argv.length;
    for (var i = 0; i < n; ++i) {
      if (/^--config:/.test(argv[i])) {
        var key = argv[i].substring(9);
        try {
          setVal(this._config, key, JSON.parse(argv[i + 1]));
        } catch (e) {
          console.warn('Not JSON parseable:', argv[i + 1]);
        }
      }
    }

    return src.concat([
        "w.CONFIG=", JSON.stringify(this._config), ";\n",
        "})();"
    ]).join("");
  }
});


