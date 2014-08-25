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

import .renderer;

exports = Class(function (supr) {

	this.init = function (opts) {
		if (!opts) { opts = {}; }

		this.x = opts.x || 0;
		this.y = opts.y || 0;
		this.width = opts.width || 0;
		this.height = opts.height || 0;

		this._scaleMethod = opts.scaleMethod || 'stretch';
		this.setImage(opts.image);

		this._verticalAlign = opts.verticalAlign;
		this._align = opts.align;

		this._onload = opts.onload;

		if (opts.sourceSlices && opts.destSlices) {
			this._sourceSlices = opts.sourceSlices;
			this._destSlices = opts.destSlices;
			this._sourceSlicesHor = [opts.sourceSlices.hor.left, opts.sourceSlices.hor.center, opts.sourceSlices.hor.right];
			this._sourceSlicesVer = [opts.sourceSlices.ver.top, opts.sourceSlices.ver.middle, opts.sourceSlices.ver.bottom];
			this._destSlicesHor = [opts.destSlices.hor.left, 0, opts.destSlices.hor.right];
			this._destSlicesVer = [opts.destSlices.ver.top, 0, opts.destSlices.ver.bottom];
			this._checkBounds = true;
		}

		this.computePosition();
		renderer.add(this);
	}

	this.getImage = function () { return this._img; }
	this.setImage = function (img) {
		if (typeof img == 'string') {
			this._img = new Image();
			this._img.onload = bind(this, function () {
				this._onload && this._onload(this);
				renderer.render();
			});

			this._img.src = img;
		} else {
			this._img = img;
		}
	}

	this.computePosition = function () {
		var w = this.width || renderer.width;
		var h = this.height || renderer.height;

		var iw = this._img.width;
		var ih = this._img.height;

		if (!this._img.complete) { return false; }

		switch (this._scaleMethod) {
			case 'none':
				return {x: 0, y: 0, width: iw, height: ih, scale: 1};
			case 'stretch':
				return {x: 0, y: 0, width: w, height: h};
			case 'contain':
			case 'cover':
			default:
				var scale = 1;
				var targetRatio = iw / ih;
				var ratio = w / h;
				if (this._scaleMethod == 'cover' ? ratio > targetRatio : ratio < targetRatio) {
					scale = w / iw;
				} else {
					scale = h / ih;
				}
				var finalWidth = iw * scale;
				var finalHeight = ih * scale;
				var x = this._align == 'left' ? 0 : this._align == 'right' ? w - finalWidth : (w - finalWidth) / 2;
				var y = this._verticalAlign == 'top' ? 0 : this._verticalAlign == 'bottom' ? h - finalHeight : (h - finalHeight) / 2;
				return {x: x, y: y, width: finalWidth, height: finalHeight, scale: scale};
		}
	}
	
	this.render = function (ctx) {
		if (!this._img || !this._img.complete) { return; }
		
		ctx.save();
		try {
			ctx.translate(this.x, this.y);

			if (this._scaleMethod === '9slice') {
				var debugColors = ['#FF0000', '#00FF00', '#0000FF'];
				var image = this._img;
				var bounds = { width:this._img.width, height: this._img.height};
				var sourceSlicesHor = this._sourceSlicesHor;
				var sourceSlicesVer = this._sourceSlicesVer;
				var destSlicesHor = [];
				var destSlicesVer = [];
				var width = this.width || renderer.width;
				var height = this.height || renderer.height;
				var scale = 1;
				var sx, sy, sw, sh;
				var dx, dy, dw, dh;
				var i, j;

				if ((bounds.width <= 0) || (bounds.height <= 0)) {
					return;
				}
				if (this._checkBounds) {
					this._checkBounds = false;
					sw = 0;
					sh = 0;
					for (i = 0; i < 3; i++) {
						sw += sourceSlicesHor[i];
						sh += sourceSlicesVer[i];
					}
					for (i = 0; i < 3; i++) {
						sourceSlicesHor[i] = (sourceSlicesHor[i] * bounds.width / sw) | 0;
						sourceSlicesVer[i] = (sourceSlicesVer[i] * bounds.height / sh) | 0;
					}
				}

				destSlicesHor[0] = this._destSlicesHor[0] * scale | 0;
				destSlicesHor[2] = this._destSlicesHor[2] * scale | 0;
				destSlicesHor[1] = width - destSlicesHor[0] - destSlicesHor[2];

				destSlicesVer[0] = this._destSlicesVer[0] * scale | 0;
				destSlicesVer[2] = this._destSlicesVer[2] * scale | 0;
				destSlicesVer[1] = height - destSlicesVer[0] - destSlicesVer[2];

				sy = 0;
				dy = 0;
				for (j = 0; j < 3; j++) {
					sh = sourceSlicesVer[j];
					dh = destSlicesVer[j];
					sx = 0;
					dx = 0;
					for (i = 0; i < 3; i++) {
						sw = sourceSlicesHor[i];
						dw = destSlicesHor[i];
						if ((dw > 0) && (dh > 0)) {
							ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
							if (this.debug) {
								ctx.strokeStyle = debugColors[(j + i) % 3];
								ctx.strokeRect(dx + 0.5, dy + 0.5, dw - 1, dh - 1);
							}
						}

						sx += sw;
						dx += dw;
					}
					sy += sh;
					dy += dh;
				}

			} else {
				var pos = this.computePosition();
				if (pos) {
					ctx.drawImage(this._img, pos.x, pos.y, pos.width, pos.height);
				}
			}
		} catch (e) {

		} finally {
			ctx.restore();
		}

	}
});
