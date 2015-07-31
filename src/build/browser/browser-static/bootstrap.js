function bootstrap(initialImport, target) {
	var w = window;
	var d = document;
	var loc = w.location;
	var q = loc.search + loc.hash;

	// for tracking when the page started loading
	w.__initialTime = +new Date();

	try {
		// override any config params provided already
		if (w.CONFIG_OVERRIDES) {
			for (var key in w.CONFIG_OVERRIDES) {
				w.CONFIG[key] = w.CONFIG_OVERRIDES[key];
			}
		}

		var uri = decodeURIComponent((w.location.search || '?').substr(1));
		if (uri[0] == '{') {
			// override any config params in the URL
			var overrideCONFIG = JSON.parse(uri);
			if (overrideCONFIG) {
				for (var key in overrideCONFIG) {
					w.CONFIG[key] = overrideCONFIG[key];
				}
			}
		}
	} catch(e) {

	}

	if (w.CONFIG.CDNURL) {
		d.write('<base href="' + w.CONFIG.CDNURL + '">');
	}

	// figure out the dpr
	if (w.CONFIG.scaleDPR === false) {
		var scale = 1;
	} else {
		var scale = (1 / (w.devicePixelRatio || 1));
	}

	// figure out the device type
	var ua = navigator.userAgent;
	var mobile = (/(iPod|iPhone|iPad)/i.test(ua) ? 'ios' : /BlackBerry/.test(ua) ? 'blackberry' : /Mobile Safari/.test(ua) ? 'android' : '');
	var isKik = /Kik\/\d/.test(ua);

	// set the viewport
	if (mobile == 'ios') {
		// Using initial-scale on android makes everything blurry! I think only IOS
		// correctly uses devicePixelRatio.  Medium/high-res android seems to set
		// the dpr to 1.5 across the board, regardless of what the dpr should actually
		// be...
		d.write('<meta name="viewport" content="'
				+ 'user-scalable=no'
				+ ',initial-scale=' + scale
				+ ',maximum-scale=' + scale
				+ ',minimum-scale=' + scale
				+ ',width=device-width'
			+ '" />');

		// detect ios operating system version
		var match = ua.match(/iPhone OS ([0-9]+)/);
		var iosVersion = match && parseInt(match[1]);
	}

	if (!Image.get) {
		Image.set = function(url, img) { CACHE[url] = img; };
		Image.get = function(url) { return CACHE[url]; };
	}

	// TODO: Remove this automatic false. Kik does not always show up in the user agent so
	//       default to not being able to hide the progress bar for now
	var canHideAddressBar = false && !(iosVersion && iosVersion >= 7) && !isKik && mobile;

	w.hideAddressBar = function() {
		if (!mobile || !canHideAddressBar) { return; }

		d.body.style.height = 2 * screen.height + 'px';
		if (mobile == 'ios') {
			w.scrollTo(0, 1);
			w.scrollTo(0, 0);
		} else {
			w.scrollTo(0, 1);
		}

		d.body.offsetHeight;
	}

	hideAddressBar();
	var min = w.innerHeight;

	var loaded = false;
	w._continueLoad = function() {
		var loadTargetJS = function() {
			if (!loaded) {
				loaded = true;
				// Include the game code
				var el = d.createElement('script');
				el.src = target + '.js';
				d.getElementsByTagName('head')[0].appendChild(el);
			}
		};

		var _continueLoadDefer;

		w.addEventListener('message', function(event) {
			if (event.data === 'partialLoadContinue') {
				if (_continueLoadDefer) {
					_continueLoadDefer.resolve();
					_continueLoadDefer = undefined;
				}
			}
		});
		// Preload suggestions and then tell the parent bootstrapping is complete
		jsio.__env.preloadModules(function() {
			w.parent.postMessage('bootstrapping', '*');
		});

		var partialLoadKey = jsio.__env.getNamespace('partialLoad');
		if (localStorage && localStorage.getItem(partialLoadKey)) {
			localStorage.removeItem(partialLoadKey);

			_continueLoadDefer = Promise.defer();
			_continueLoadDefer.promise.then(loadTargetJS);
		} else {
			loadTargetJS();
		}
	};

	var fontsLoaded;
	if (CONFIG.embeddedFonts) {
		var defaultWidth = 0;
		var fontNodes = [];
		for (var i = 0, n = CONFIG.embeddedFonts.length; i < n; ++i) {
			var font = CONFIG.embeddedFonts[i];
			var el = d.body.appendChild(d.createElement('span'));
			el.innerHTML = 'giItT1WQy@!-/#';
			el.style.cssText = 'position:absolute;left:-9999px;font-size:100px;visibility:hidden;';
			if (!defaultWidth) {
				defaultWidth = el.offsetWidth;
			}
			el.style.fontFamily = font;
			fontNodes.push(el);
		}
	} else {
		fontsLoaded = true;
	}

	var orientationOk = true;
	var supportedOrientations = CONFIG.supportedOrientations;
	function checkOrientation() {
		var ow = w.outerWidth;
		var oh = w.outerHeight;
		var isPortrait = oh > ow;
		orientationOk = isPortrait && supportedOrientations.indexOf('portrait') != -1
			|| !isPortrait && supportedOrientations.indexOf('landscape') != -1;
	}

	if (mobile && supportedOrientations) {
		checkOrientation();
	}

	var appCache = window.applicationCache;
	['cached', 'checking', 'downloading', 'error', 'noupdate', 'obsolete', 'progress', 'updateready'].forEach(function (evt) {
		appCache.addEventListener(evt, handleCacheEvent, false);
	});

	function handleCacheEvent(evt) {
		if (evt.type == 'updateready') {
			console.log("update ready");

			// reload immediately if splash is still visible
			var splash = d.getElementById('_GCSplash');
			if (splash && splash.parentNode) {
				try { appCache.swapCache(); } catch (e) {}
			}
		}
	}

	// after load, we poll for the correct document height
	w.onload = function() {
		var now = +new Date();
		var increased = false;
		var poll = setInterval(function() {
			hideAddressBar();
			// if (orientationOk) {
				var h = w.innerHeight;
				if (fontNodes) {
					var isLoaded = true;
					for (var i = 0, n = fontNodes.length; i < n; ++i) {
						if (fontNodes[i].offsetWidth == defaultWidth) {
							isLoaded = false;
							break;
						}
					}

					if (isLoaded) {
						fontsLoaded = true;
					}
				}

				// timeout after 1 second and assume we have the right height, or
				// note when the height increases (we scrolled) and launch the app
				if (h == min && increased && fontsLoaded || +new Date() - now > 5000 || !canHideAddressBar && fontsLoaded) {
					if (mobile == 'android') {
						w.scrollTo(0, -1);
					}

					clearInterval(poll);

					setTimeout(function () {
						jsio("import devkit.browser.bootstrap.launchBrowser");
					}, 0);
				}

				// some android phones report correctly first, then shrink the height
				// to fit the address bar. always reset min
				if (h > min) { increased = true; }
				min = h;
			// }
		}, 20);
	}
}
