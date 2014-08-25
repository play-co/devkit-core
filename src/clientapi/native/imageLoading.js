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

import lib.PubSub;

merge(NATIVE.gl, lib.PubSub.prototype);

var loadingImages = {};
var canvasImages = {};

NATIVE.camera.getPicture = function (size, id) {
	size = size || 64;
	id = id || NATIVE.camera.getNextId();
	var src = '@CAMERA' + id + '-' + size;
	var image = new Image();
	image.src = src;
	return image;
};

NATIVE.gallery.choosePicture = function (size, id) {
	size = size || 64;
	id = id || NATIVE.gallery.getNextId();
	var src = '@GALLERYPHOTO' + id + '-' + size;
	var image = new Image();
	image.src = src;
	return image;
};

NATIVE.gl.loadImage = function (image) {
	var texData = NATIVE.gl._loadImage(image._src);
	if (texData) {
		setTimeout(function () {
			image._onload(texData.width, texData.height, texData.name);
		}, 0);
	} else {
		if (!loadingImages[image._src]) {
			loadingImages[image._src] = [];
		}
		loadingImages[image._src].push(image);
	}
}

NATIVE.events.registerHandler('imageLoaded', function (evt) {
	var logURL = evt.url;
	if (logURL.substring(0, 11) == 'data:image/') {
		logURL = '<base64>';
	}

	NATIVE.gl.publish('imageLoaded', evt);

	logger.debug('imageLoaded:', logURL, evt.originalWidth + 'x' + evt.originalHeight, '(' + evt.width + 'x' + evt.height + ')');

	var images = loadingImages[evt.url];
	delete loadingImages[evt.url];

	if (images) { 
		images.forEach(function (image) { 
			image._onload(evt.originalWidth, evt.originalHeight, evt.glName);
			GLOBAL.GC && GC.app && GC.app.engine && GC.app.engine.needsRepaint();
		});
	}
});

NATIVE.events.registerHandler('imageError', function (evt) {
	var images = loadingImages[evt.url];
	if (images) {
		images.forEach(function (image) {
			if (image._onerror) {
				image._onerror();
			}
		});
		delete loadingImages[evt.url];
	}
});

NATIVE.gl.makeCanvas = function (width, height, unloadListener) {
	var textureData = NATIVE.gl.newTexture(width, height);

	var url = textureData._src;
	canvasImages[url] = unloadListener;

	logger.log("{canvas-registry} Registering canvas:", url);

	return textureData;
}

NATIVE.gl.forgetCanvas = function (url) {
	logger.log("{canvas-registry} Forgetting canvas:", url);

	var listener = canvasImages[url];
	if (listener) {
		delete canvasImages[url];
	}
}

NATIVE.events.registerHandler('canvasFreed', function (evt) {
	var url = evt.url;

	logger.log("{canvas-registry} Notifying of lost canvas:", url);

	var listener = canvasImages[url];
	if (listener) {
		if (typeof listener === "function") {
			listener(url);
		}
		delete canvasImages[url];
	}
});

