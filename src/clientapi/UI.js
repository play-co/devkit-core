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
import ui.widget.Spinner as Spinner;

var config = window.CONFIG;

exports = Class(function () {
	this._spinnerCounter = 0;

	import device;

	var baseScale;
	if (navigator.displayMetrics) {
		baseScale = navigator.displayMetrics.densityDpi / 160;
	} else if (!CONFIG.scaleDPR && device.isMobileBrowser) {
		baseScale = 1;
	} else {
		baseScale = window.devicePixelRatio || 1;
	}

	this._scale = baseScale;

	this.setTargetDensity = function (target) {
		switch (target) {
			case 'high':
				this._scale = baseScale * 0.5;
				break;
			case 'medium':
				this._scale = baseScale * 0.75;
				break;
			case 'low':
			default:
				this._scale = baseScale;
				break;
		}

		logger.log('scale:', this._scale);
	}

	this.getScale = function () {
		return this._scale;
	}

	this.getIntValue = function (val) {
		return Math.round(val * this._scale) / this._scale;
	}

	this.showSpinner = function () {
		if (this._spinnerCounter) {
			++this._spinnerCounter;
			return;
		}

		var parent = GC.app.view;
		if (!parent) { return; }

		++this._spinnerCounter;

		if (!this._spinner) {
			var dim = device.screen.devicePixelRatio * 50;
			this._spinner = new Spinner({
				width: dim,
				height: dim,
				x: parent.style.width / 2 - dim / 2,
				y: parent.style.height / 2 - dim / 2,
				parent: parent
			});
		} else {
			parent.addSubview(this._spinner);
		}
	}

	this.hideSpinner = function () {
		--this._spinnerCounter;
		if (this._spinnerCounter <= 0) {
			this._spinnerCounter = 0;

			this._spinner && this._spinner.removeFromSuperview();
		}
	}
});

