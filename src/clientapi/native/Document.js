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
import device;
if (typeof document == 'undefined') {
	GLOBAL.document = {};
}

var createDummyObject = function(parent, name) {
    var dummyObj = {};
    parent.__defineGetter__(name, function() {
        logger.warn('Accessing', name, 'is a dummy object!');
        return dummyObj;
    });
};

var addDOMAPI = function(el) {
    el.getBoundingClientRect = function() {
        return {
            left: 0,
            top: 0,
            right: this.width,
            bottom: this.height,
            width: this.width,
            height: this.height
        };
    };
};

if (!document.body) {
    createDummyObject(document, 'body');
}
if (!document.documentElement) {
    createDummyObject(document, 'documentElement');
}
document.body.appendChild = function() {
    logger.warn('document.body.appendChild is unimplemented');
};

document.getElementById = function() {
    logger.warn('document.getElementById is not implemented');
    return undefined;
};

if (!document.createElement) {
	var handlers = {};
	document.createElement = function (type) {
		type = type.toUpperCase();
		if (type in handlers) {
			return handlers[type]();
		}
	};

	document.__registerCreateElementHandler = function (type, cb) {
		type = type.toUpperCase();
		handlers[type] = cb;
	};
}
addEventListenerAPI(window);
addEventListenerAPI(document);

document.readyState = 'complete';
