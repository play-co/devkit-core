/**
 * @license
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
handlers = {};

NATIVE.call = function (method, args) {
  json = {};
  try {
    json = JSON.parse(NATIVE._call(method, JSON.stringify(args)));
  } catch (e) {
    logger.log(e);
  }
  return json;
};

NATIVE.events = {};
NATIVE.events.registerHandler = function (name, handler) {
  handlers[name] = handler;
};

import {
  NATIVE,
  logger,
  log
} from 'base';

NATIVE.events.dispatchEvent = function (evt, id) {
  if (typeof evt == 'string') {
    try {
      evt = JSON.parse(evt);
    } catch (e) {
      logger.error('Parse error:', e);
      logger.error(evt);
      return;
    }
  }
  // TODO maybe do this in a better way
  // android sends the requestId back on the event object
  // ios does not
  if (evt._requestId && !id) {
    id = evt._requestId;
    delete evt._requestId;
  }

  var handler = handlers[evt.name];
  if (handler) {
    handler(evt, id);
  }
};

import backButton from './backButton';
import dialog from './dialog';
import imageLoading from './imageLoading';
import input from './input';
import inputPrompt from './inputPrompt';
import log from './log';
import offscreenBuffer from './offscreenBuffer';
import online from './online';
import overlay from './overlay';
import pauseResume from './pauseResume';
import plugins from './plugins';
import purchase from './purchase';
import rotation from './rotation';
import soundLoading from './soundLoading';
import windowFocus from './windowFocus';
