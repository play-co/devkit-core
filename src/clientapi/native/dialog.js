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

var dialogId = 0;
var dialogCallbacks = {};

NATIVE.dialogs.showDialog = function (title, text, image, buttons) {
	var labels = [], callbacks = [], cbs = [];
	var len = buttons.length;
	for(var i = 0; i < len; i++) {
		labels[i] = buttons[i].label;
		callbacks[i] = buttons[i].callback;
	}
	for(var i = 0; i < len; i++) {
		cbs[i] = dialogId;
		dialogCallbacks[dialogId] = callbacks[i];
		dialogId++;
	}
	NATIVE.dialogs._showDialog(title, text, image, labels, cbs);
};

NATIVE.dialogs.showUpdate = function (title, text, confirmLabel, denyLabel, image, callback) {
	title = title || CONFIG.title + ' has been updated!';
	text = text || "There's an update for " + CONFIG.title + "! Do you want to apply it?";
	confirmLabel = confirmLabel || 'OK';
	denyLabel = denyLabel || 'Not now';
	var ok = { label: confirmLabel, callback: function () { callback(); } };
	var notnow = { label: denyLabel, callback: function () {} };
	NATIVE.dialogs.showDialog(title, text, image, [ok, notnow]);
};


NATIVE.dialogs.showCrossPromo = function (appID, displayName, image) {
	var title = "Try " + displayName + "!";
	var msg = "We noticed you've enjoyed " + CONFIG.title + " and we think you might enjoy " + displayName + ". Do you want to try it?";
	image = image || null;
	var sure = { label: 'Sure!', callback: function () { NATIVE.startGame(appID); } };
	var nothanks = { label: 'Maybe layer', callback: function () { /* do nothing */ } };
	NATIVE.dialogs.showDialog(title, msg, image, [sure, nothanks]);
};

NATIVE.dialogs.showAppRater = function (title, text, image) {
	title = title || "Rate " + CONFIG.title;
	text = text || "It looks like you're enjoying " + CONFIG.title + ". Please take a moment to rate it. Thanks!";
	if (!image) {
		var splash = CONFIG.splash;
		image = splash.landscape768;
		if (!image) image = splash.landscape1536;
		if (!image) image = splash.portrait480;
		if (!image) image = splash.portrait960;
		if (!image) image = splash.portrait1024;
		if (!image) image = splash.portrait1136;
		if (!image) image = splash.portrait2048;
	}
	var rateme = { label: title, callback: function () { GLOBAL.setLocation(NATIVE.market.url); } };
	var nothanks = { label: "No thanks", callback: function () {} };
	var remindme = { label: "Remind me later", callback: function () {} };
	NATIVE.dialogs.showDialog(title, text, image, [rateme, remindme, nothanks]);
};

NATIVE.events.registerHandler('dialogButtonClicked', function (evt) {
	var cb = dialogCallbacks[evt.id];
	if(cb && cb instanceof Function) {
		cb();
		delete dialogCallbacks[evt.id];
	}
});
