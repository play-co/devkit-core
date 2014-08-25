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

NATIVE.events.registerHandler('soundLoaded', function (evt) {
	logger.log('sound loaded with url', evt.url);
	var loadedSound = sounds[evt.url];
	if (loadedSound && !loadedSound.complete) {
		loadedSound.complete = true;
		loadedSound.onload();
		delete sounds[evt.url];
	}
});


NATIVE.events.registerHandler('soundError', function (evt) {
	logger.log('sound with url', evt.url, 'failed to load');
	var failedSound = sounds[evt.url];
	if (failedSound) {
		failedSound.onerror();
	}
});

NATIVE.events.registerHandler('soundDuration', function (evt) {
	logger.log('sound with url', evt.url, 'is', evt.duration, 'seconds long');
	if (evt.url in songs) {
		songs[evt.url].duration = evt.duration;
		songs[evt.url].durationMilliseconds = evt.duration * 1000;
	}
});

var sounds = {};
var Sound = Class(function (supr) {
	this.init = function (opts) {
		this.src = opts.src || null;
		this.complete = opts.complete || null;
	}

	this.onload = this.onerror = function () {}
});
NATIVE.sound.preloadSound = function (url) {
	NATIVE.sound.loadSound(url);
	sounds[url] = new Sound({
		src: url,
		complete: false,
	});
	return sounds[url];
}

var songs = {};
NATIVE.sound.registerMusic = function (url, sound) {
	songs[url] = sound;
}