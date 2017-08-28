let exports = {};

/** @license
 * This file is part of the Game Closure SDK.
 *
 * The Game Closure SDK is free software: you can redistribute it and/or modify
 * it under the terms of the Mozilla Public License v. 2.0 as published by Mozilla.

 * The Game Closure SDK is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * Mozilla Public License v. 2.0 for more details.

 * You should have received a copy of the Mozilla Public License v. 2.0
 * along with the Game Closure SDK.  If not, see <http://mozilla.org/MPL/2.0/>.
 */
// Import this before importing GC
// _api.client.init sets up the GC object for the client apis
/* globals CONFIG, Class, bind, logger, merge */
import {
  GLOBAL,
  logger,
  CONFIG,
  merge
} from 'base';

import Engine from 'ui/Engine';
import loader from 'ui/resource/loader';
import FontRenderer from 'platforms/browser/FontRenderer';

if (!GLOBAL.CONFIG) {
  GLOBAL.CONFIG = {};
}
if (!GLOBAL.DEBUG) {
  GLOBAL.DEBUG = false;
}

var spritesheets;
try {
  if (GLOBAL.CACHE) {
    spritesheets = JSON.parse(GLOBAL.CACHE['spritesheets/map.json']);
  }
} catch (e) {
  logger.warn('spritesheet map failed to parse', e);
}

var soundMap;
try {
  if (GLOBAL.CACHE) {
    soundMap = JSON.parse(GLOBAL.CACHE['resources/sound-map.json']);
  }
} catch (e) {
  logger.warn('sound map failed to parse', e);
}

loader.addSheets(spritesheets);
loader.addAudioMap(soundMap);

exports.startApp = function (ApplicationCtor, simulatorModules)  {

  if (CONFIG.version) {
    logger.log('Version', CONFIG.version);
  }

  ApplicationCtor.prototype.__root = true;
  var app = new ApplicationCtor();

  app.view = app;
  // legacy, deprecated
  app.engine = new Engine(merge({ view: app }, app._settings));
  app.engine.show();
  app.engine.startLoop();

  // N.B: application needs to be attached to GC before call to initUI
  GC.attachApp(app);

  app.initUI && app.initUI();

  FontRenderer.init();

  if (simulatorModules) {
    // client API inside simulator: call init() on each simulator module,
    // optionally block on a returned promise for up to 5 seconds
    simulatorModules.forEach(function (module) {
      if (typeof module.onApp == 'function') {
        module.onApp(app);
      }
    });
  }

  window.addEventListener('pageshow', function onShow () {
    app && app.onResume && app.onResume();
  }, false);

  window.addEventListener('pagehide', function onHide () {
    app && app.onPause && app.onPause();
  }, false);

};

export default exports;
