'use strict';
const path = require('path');

const jsio = require('jsio');
// const devkitApps = require('devkit/src/apps');
// const devkitConfig = require('devkit/src/build/steps/getConfig');

// const DevkitCorePlugin = require('./DevkitCorePlugin');
const jsCompilerUtils = require('../jsCompilerUtils');

const DEVKIT_CORE_DIR = path.resolve(__dirname, '..', '..', '..');


const getBuildInfo = () => {
  const buildInfo = {
    // cwd: jsioOpts.cwd,
    cwd: path.resolve(process.cwd()),
    outputPath: path.resolve(process.cwd(), 'build-es6'),
    // path: [jsio.__env.getPath(), '.', 'lib'],
    // pathCache: {}
  };

  // const app = devkitApps.get();
  // const config = devkitConfig.getConfig(app, {});

  // if (config && config.clientPaths) {
  //   jsCompilerUtils.addClientPaths(buildInfo.path, buildInfo.pathCache, config.clientPaths);
  // }
  // if (app && app.clientPaths) {
  //   jsCompilerUtils.addClientPaths(buildInfo.path, buildInfo.pathCache, app.clientPaths);
  // }

  return buildInfo;
};


const mapPath = (p) => {
  if (path.isAbsolute(p)) {
    return p;
  }
  const buildInfo = getBuildInfo();
  return path.resolve(buildInfo.cwd, p);
};


const configure = (configurator, options) => {
  // configurator.plugin('DevkitCore', DevkitCorePlugin, [{
  //   hello: 'world'
  // }]);

  const buildInfo = getBuildInfo();
  configurator.merge({
    entry: {
      app: path.resolve(buildInfo.cwd, 'src', 'Application.js')
    },
    output: {
      filename: '[name].js',
      path: buildInfo.outputPath,
      publicPath: '/'
    }
  });

  options.useModuleAliases = true;
  options.useCircularDependencyPlugin = true;

  return configurator;
};


const postConfigure = (configurator, options) => {
  configurator.removePreLoader('eslint');

  configurator.loader('babel', current => {
    current.exclude = null;
    return current;
  });

  const buildInfo = getBuildInfo();
  configurator.merge(current => {
    // Add module paths and aliases
    // const paths = buildInfo.path.map(mapPath);
    const paths = [

    ];
    current.resolve.root = current.resolve.root.concat(paths);

    current.resolve.alias = current.resolve.alias || {};
    // for (var pathCacheKey in buildInfo.pathCache) {
    //   current.resolve.alias[pathCacheKey] = mapPath(buildInfo.pathCache[pathCacheKey]);
    // }

    // This should be per platform (depending on build type)
    // current.resolve.alias.timestepInit = path.resolve(
    //   DEVKIT_CORE_DIR, 'src', 'clientapi', 'browser'
    // );

    // current.resolve.root.push(path.resolve(
    //   DEVKIT_CORE_DIR, 'modules', 'timestep'
    // ));

    // current.resolve.alias.jsio = path.resolve(
    //   path.dirname(require.resolve('jsio')),
    //   'jsio-web'
    // );

    // current.resolve.alias.devkitCore = path.resolve(DEVKIT_CORE_DIR);

    if (process.env.NODE_ENV === 'production') {
      current.devtool = null;
      current.output.pathinfo = false;
    } else {
      // original code, no breakpoints
      // current.devtool = 'cheap-module-eval-source-map';
      // transformed code, no breakpoints
      // current.devtool = 'cheap-eval-source-map';
      // bundle, yes breakpoints
      // current.devtool = 'cheap-source-map';
      // original code, no breakpoints
      // current.devtool = 'eval-source-map';
      // current.devtool = 'source-map';
      // current.devtool = null;
      // transformed code, yes breakpoints
      current.devtool = 'eval';
      current.output.pathinfo = true;
    }

    return current;
  });
};


module.exports = {
  configure: configure,
  postConfigure: postConfigure
};
