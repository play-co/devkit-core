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

if (typeof document == 'undefined') {
	window.document = {};
}

if (!document.createElement) {
	import .HTMLElement;
	var handlers = {};

	document.createElement = function (type) {
		type = type.toUpperCase();
		if (type in handlers) {
			return handlers[type]();
		}

		var el = new HTMLElement();
		el.tagName = type;
		return el;
	};

	document.__registerCreateElementHandler = function (type, cb) {
		type = type.toUpperCase();
		handlers[type] = cb;
	};
}

if (!document.documentElement) {
	document.documentElement = document.createElement('html');
	document.documentElement.appendChild(document.createElement('head'));

	import jsio.util.setProperty as setProperty;
	import device;
	setProperty(document.documentElement, 'clientWidth', {
		get: function () { return device.screen.width; }
	});

	setProperty(document.documentElement, 'clientHeight', {
		get: function () { return device.screen.height; }
	});
}

if (!document.body) {
	document.body = document.documentElement.appendChild(document.createElement('body'));
}

if (!document.getElementById) {
	document.getElementById = function (id) {
		return _getElementById(id, document.documentElement);
	};
}

if (!document.getElementsByTagName) {
	document.getElementsByTagName = function (tagName) {
		tagName = tagName.toUpperCase();
		var res = [];
		_collectByTagName(document.documentElement, tagName, res);
		return res;
	};
}

function _collectByTagName(node, tagName, res) {
	if (node.tagName === tagName) { res.push(node); }
	if (!node.childNodes) { return; }
	var n = node.childNodes.length;
	for (var i = 0; i < n; ++i) {
		var child = node.childNodes[i];
		if (child) {
			_collectByTagName(child, tagName, res);
		}
	}
}

function _getElementById(id, node) {
	if (node.id === id) { return node; }
	if (!node.childNodes) { return; }
	var n = node.childNodes.length;
	for (var i = 0; i < n; ++i) {
		var child = node.childNodes[i];
		if (child) {
			var res = _getElementById(id, child);
			if (res) {
				return res;
			}
		}
	}
}
