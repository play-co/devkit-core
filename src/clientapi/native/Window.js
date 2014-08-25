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

"use import";

import lib.PubSub;

var _evts = new lib.PubSub();

window.open = window.open || window.setLocation;

window.addEventListener = function (evtName, cb, isBubble) {
	_evts.subscribe(evtName, window, cb);
}

window.removeEventListener = function (evtName, cb, isBubble) {
	_evts.unsubscribe(evtName, window, cb);
}

window.__fireEvent = function (name, evt) {
	if (!evt) { evt = {}; }
	evt.type = name;
	_evts.publish(name, evt);
}
