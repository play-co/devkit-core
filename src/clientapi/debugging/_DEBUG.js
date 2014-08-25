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

// this whole file should not get included in release
if (DEBUG) {

	/*
	 * Tools for traversing views from the JS console.
	 * This class ends up being in the global scope:
	 *   GLOBAL._DEBUG = new exports();
	 */
	exports = Class(function () {

		this.screenshot = function (cb) {
			import device;
			var canvas = GC.app.engine.getElement();

			var Canvas = device.get('Canvas');
			var _debugCanvas = new Canvas({
					width: canvas.width,
					height: canvas.height
				});
			
			if (_debugCanvas && _debugCanvas.toDataURL) {
				var ctx = _debugCanvas.getContext('2d');
				var reDomain = /^https?:\/\/(.*?)\//;
				var origDrawImage = ctx.drawImage;
				ctx.drawImage = function (img, sx, sy, sw, sh, dx, dy, dw, dh) {
					var match = img.src.match(reDomain);
					if (match && match[1] != location.host) {
						if (dw != undefined && dh != undefined) {
							this.drawBrokenImage(dx, dy, dw, dh);
						} else if (dx != undefined) {
							this.drawBrokenImage(dx, dy, sw, sh);
						} else if (sw != undefined) {
							this.drawBrokenImage(sx, sy, sw, sh);
						} else {
							this.drawBrokenImage(sx, sy, img.width, img.height);
						}
					} else {
						origDrawImage.apply(this, arguments);
					}
				};

				ctx.drawBrokenImage = function (x, y, w, h) {
					var lineWidth = 6;
					x = x || 0;
					y = y || 0;
					if (w && h) {
						this.save();
						this.clipRect(x, y, w, h);
						this.fillStyle = 'rgba(0, 0, 0, 0.5)';
						this.fillRect(x, y, w, h);
						this.lineWidth = lineWidth;
						this.strokeStyle = 'rgba(255, 255, 255, 0.5)';
						this.strokeRect(x + lineWidth / 2, y + lineWidth / 2, w - lineWidth, h - lineWidth);
						this.strokeStyle = 'rgba(255, 0, 0)';
						this.fillStyle = 'red';
						this.font = 'bold 15px Helvetica';
						this.textAlign = 'center';
						this.textBaseline = 'middle';
						this.fillText("X", x + w / 2, y + h / 2);
						this.restore();
					}
				}

				GC.app.engine.getView().__view.wrapRender(ctx, {});

				try {
					var base64Image = _debugCanvas.toDataURL('image/png');
				} catch (e) {
					cb({
						NOT_SUPPORTED: true,
						error: e
					});
				}

				if (base64Image) {
					cb(null, {
						width: _debugCanvas.width,
						height: _debugCanvas.height,
						base64Image: base64Image
					});
				}
			} else {
				cb({
					NOT_SUPPORTED: true
				});
			}
		}

		this.traverse = function (f) { return GC.app && this.traverseView(f, GC.app.view); }
		this.traverseView = function (f, view) {
			var data = f(view);
			var subviews = view.getSubviews().map(bind(this, 'traverseView', f));
			return {
				uid: view.uid,
				data: data,
				subviews: subviews.length ? subviews : undefined
			};
		}

		this.find = function (f) { return GC.app && this.findView(f, GC.app.view); }
		this.findView = function (f, view) {
			if (f(view)) { return view; }
			var subviews = view.getSubviews();
			for (var i = 0, sub; sub = subviews[i]; ++i) {
				var res = this.findView(f, sub);
				if (res) { return res; }
			}

			return false;
		}

		var _isHighlighting = false;
		var _highlightViews = [];

		var _renderHighlights = (function () {
			var prev = null;
			var highlight = 0;
			var fadeIn = true;
			var FADE_IN_TIME = 1000;
			return function (ctx) {
				var now = Date.now();
				var dt = 0;
				if (prev) {
					dt = now - prev;
				}

				prev = now;

				if (fadeIn) {
					highlight += dt;
					if (highlight >= FADE_IN_TIME) {
						fadeIn = false;
						highlight = FADE_IN_TIME;
					}
				} else {
					highlight -= dt;
					if (highlight < 0) {
						fadeIn = true;
						highlight = 0;
					}
				}

				_highlightViews.forEach(function (view) {
					var pos = view.getPosition();
					var gray = Math.round(255 * highlight / FADE_IN_TIME);
					ctx.save();
					ctx.fillStyle = 'rgba(' + gray + ',' + gray + ',' + gray + ',' + gray / 512 + ')';
					ctx.strokeStyle = 'rgba(' + gray + ',0,0,1)';
					ctx.rotate(pos.r);
					ctx.fillRect(pos.x, pos.y, pos.width, pos.height);
					ctx.strokeRect(pos.x - 0.5, pos.y - 0.5, pos.width + 1, pos.height + 1);
					ctx.restore();
				});
			}
		})();

		this.unhighlightViews = function () {
			_highlightViews = [];
		}

		this.highlightView = function (view) {
			if (_highlightViews.indexOf(view) == -1) {
				_highlightViews.push(view);
				if (!_isHighlighting) {
					_isHighlighting = true;
					GC.app.engine.on('Render', _renderHighlights);
				}
			}
		}

		this.unhighlightView = function (view) {
			var i = _highlightViews.indexOf(view);
			if (i != -1) {
				_highlightViews.splice(i, 1);
			}
		}

		this.getViewByID = function (uid) { return this.find(function (view) { return view.uid == uid; }); }

		this.pack = function () { return GC.app && this.packView(GC.app.view); }
		this.packView = function (view) {
			import ui.ImageView;
			import ui.ImageScaleView;
			import ui.TextView;

			return this.traverseView(function (view) {

				if (view instanceof ui.ImageView || view instanceof ui.ImageScaleView) {
					var img = view.getImage();
					if (img) {
						var imageData = img.getOriginalURL() || img.getMap();
					}

					if (view.getScaleMethod) {
						var scaleMethod = view.getScaleMethod();
						if (/slice$/.test(scaleMethod)) {
							var sourceSlices = view._opts.sourceSlices;
							var destSlices = view._opts.destSlices;
						}
					}
				}

				if (view instanceof ui.TextView) {
					var text = view.getText();
				}

				var s = view.style;
				return {
					x: s.x != 0 ? s.x : undefined,
					y: s.y != 0 ? s.y : undefined,
					width: s.width,
					height: s.height,
					scale: s.scale != 1 ? s.scale : undefined,
					sourceSlices: sourceSlices,
					destSlices: destSlices,
					scaleMethod: scaleMethod,
					image: imageData,
					text: text,
					visible: s.visible == false ? false : undefined,
					opacity: s.opacity != 1 ? s.opacity : undefined,
					tag: view.getTag()
				};
			}, view);
		}

		this.unpack = function (data) {
			import ui.View;
			import ui.ImageView;
			import ui.resource.Image;
			import ui.TextView;
			import ui.ScrollView;

			function buildView (superview, data) {
				var view;

				var opts = data.data;
				opts.x = opts.x || 0;
				opts.y = opts.y || 0;
				opts.visible = 'visible' in opts ? opts.visible : true;
				opts.opacity = 'opacity' in opts ? opts.opacity : 1;
				opts.scale = opts.scale || 1;
				if (opts.image) {
					var img = opts.image;
					view = new ui.ImageView({
						x: opts.x,
						y: opts.y,
						width: opts.width,
						height: opts.height,
						scale: opts.scale,
						clip: opts.clip,

						scaleMethod: opts.scaleMethod,
						slices: opts.slices,

						superview: superview,
						image: typeof img == 'string' ? img : new ui.resource.Image({
							url: img.url,
							sourceX: img.x,
							sourceY: img.y,
							sourceW: img.width,
							sourceH: img.height,
							marginTop: img.marginTop,
							marginRight: img.marginRight,
							marginBottom: img.marginBottom,
							marginLeft: img.marginLeft
						}),
						visible: opts.visible,
						opacity: opts.opacity,
						tag: opts.tag
					});
				} else {
					view = new (opts.text ? ui.TextView : (opts.clip ? ui.ScrollView : ui.View))({
						x: opts.x,
						y: opts.y,
						clip: opts.clip,
						width: opts.width,
						height: opts.height,
						text: opts.text,
						superview: superview,
						scale: opts.scale,
						visible: opts.visible,
						opacity: opts.opacity,
						tag: opts.tag
					});
				}

				view.uid = data.uid;

				if (data.subviews) {
					for (var i = 0, sub; sub = data.subviews[i]; ++i) {
						buildView(view, sub);
					}
				}
			}

			GC.app.view.updateOpts(data.data);
			for (var i = 0, sub; sub = data.subviews[i]; ++i) {
				buildView(GC.app.view, sub);
			}
		}

		this.eachView = function (list, f) {
			for (var i = 0, n = list.length; i < n; ++i) {
				var view = this.getViewByID(list[i]);
				if (view) {
					f(view, list[i]);
				} else {
					logger.warn('view', list[i], 'not found');
				}
			}
		}

		this.hideViews = function (/* id1, id2, id3, ... */) {
			this.eachView(arguments, function (view) { view.style.visible = false; });
		}

		this.showViews = function (/* id1, id2, id3, ... */) {
			this.eachView(arguments, function (view) { view.style.visible = true; });
		}

		this.hideAllViews = function () {
			this.traverse(function (view) { view.style.visible = false; });
		}

		this.showAllViews = function () {
			this.traverse(function (view) { view.style.visible = true; });
		}

		this.hideViewRange = function (a, b) {
			var range = [];
			for (var i = a; i < b; ++i) {
				range.push(i);
			}

			this.hideViews.apply(this, range);
		}

		this.showViewRange = function (a, b) {
			var range = [];
			for (var i = a; i < b; ++i) {
				range.push(i);
			}

			this.showViews.apply(this, range);
		}
	});
}