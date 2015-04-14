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

;(function () {
    var repos = {
        "modules/devkit-core/modules/timestep/": "https://cdn.rawgit.com/gameclosure/timestep/develop/",
        "modules/devkit-core/node_modules/jsio/": "https://cdn.rawgit.com/gameclosure/js.io/develop/"
    };

    var repoPrefix = Object.keys(repos);
    var repoURLs = repoPrefix.map(function (prefix) { return repos[prefix]; });
    var numRepos = repoPrefix.length;

    jsio.__env.fetch = function (filename) {
        for (var i = 0; i < numRepos; ++i) {
            if (filename.indexOf(repoPrefix[i]) == 0) {
                var xhr = new XMLHttpRequest();
                xhr.open("GET", repoURLs[i] + filename.substring(repoPrefix[i].length), false);
                xhr.send();
                if (xhr.status == 200) {
                    return xhr.responseText;
                }
            }

        }
        return false;
    }
})();

import device;
import Promise;

GLOBAL.Promise = Promise;

var isSimulator = GLOBAL.CONFIG && !!CONFIG.simulator && (window.parent !== window);
var isNative = /^native/.test(CONFIG.target);

if (isSimulator) {
  // prefix filenames in the debugger
  jsio.__env.debugPath = function (path) { return 'http://' + (CONFIG.bundleID || CONFIG.packageName) + '/' + path.replace(/^[\.\/]+/, ''); }

  if (isNative) {
    import ..debugging.nativeShim;
  }
}

// shims

if (!window.JSON) {
  jsio('import std.JSON').createGlobal();
}

if (!window.console) {
  window.console = {};
  window.console.log = window.console.info = window.console.error = window.console.warn = function () {};
}

if (typeof localStorage !== 'undefined') {
  localStorage = {
    getItem: function () {},
    setItem: function () {},
    removeItem: function () {}
  };
}

if (!isSimulator) {
  // start the cache service-worker
  import .cache;
}

var splash = document.getElementById('_GCSplash');
if (splash) {
  if (!CONFIG.splash.hide) {
    CONFIG.splash.hide = function () {
        // timeout lengths are debateable. Perhaps they could
        // be configurable. On one hand these time out lengths increase
        // the length of time that nothing is happening. However, it also
        // makes the transition into the game much smoother. The initial timeout
        // is for images to pop in.
        setTimeout(function() {
          splash.style.opacity = 0;
          splash.style.pointerEvents = 'none';
          setTimeout(function() {
            splash.parentNode.removeChild(splash);
          }, 500);
        }, 100);
      };
  }
}

// parsing options
import std.uri;
var uri = new std.uri(window.location);
var mute = uri.hash('mute');
CONFIG.isMuted = true; // mute != undefined && mute != "false" && mute != "0" && mute != "no";

if (DEBUG) {
  import ..debugging;

  var DEVICE_ID_KEY = '.devkit.deviceId';
  var deviceId;
  var deviceType;

  if (isSimulator) {
    Promise.map(CONFIG.simulator.modules, function (name) {
        try {
          var module = jsio(name);
          if (module && module.init) {
            return module.init();
          }
        } catch (e) {}
      })
      .timeout(5000)
      .finally(queueStart);
  } else {
    // deviceId = localStorage.getItem(DEVICE_ID_KEY);
    // if (!deviceId) {
    //   import std.uuid;
    //   deviceId = std.uuid.uuid();
    //   localStorage.setItem(DEVICE_ID_KEY, deviceId);
    // }

    // if (device.isAndroid) {
    //   deviceType = 'browser-android';
    // } else if (device.isIOS) {
    //   deviceType = 'browser-ios';
    // } else {
    //   deviceType = 'browser-mobile';
    // }
    queueStart();
  }
} else {
  queueStart();
}

function queueStart() {
	if (window.GC_LIVE_EDIT && GC_LIVE_EDIT._isLiveEdit) {
		var intervalId = setInterval(function(){
			if (GC_LIVE_EDIT._liveEditReady) {
				try {
					startApp();
				} catch(err) {
					// In case loading fails, we will still clear the interval
					console.error('Error while starting app', err);
				}
				clearInterval(intervalId);
			}
		}, 100);
	} else {
		startApp();
	}
}

function startApp () {

  // setup timestep device API

  import device;
  import platforms.browser.initialize;
  device.init();

  // init sets up the GC object
  import devkit;

  // if (debugging.conn.getClient) {
  //   import ..debugging.clients.viewInspector;
  //   import ..debugging.clients.simulator;

  //   debugging.clients.viewInspector.setConn(debugging.conn);
  //   debugging.clients.simulator.setConn(debugging.conn);

  //   if (CONFIG.splash) {
  //     var prevHide = CONFIG.splash.hide;
  //     var client = debugging.conn.getClient('simulator');
  //     CONFIG.splash.hide = function () {
  //       prevHide && prevHide.apply(this, arguments);
  //       client.onConnect(function () {
  //           client.sendEvent('HIDE_LOADING_IMAGE');
  //         });
  //     };
  //   }

  //   var initDebugging = function () {
  //     var env = jsio.__env;

  //     var originalSyntax = bind(env, env.checkSyntax);

  //     env.checkSyntax = function (code, filename) {
  //       var xhr = new XMLHttpRequest();
  //       xhr.open('POST', '/api/syntax', false);
  //       xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
  //       xhr.onreadystatechange = function () {
  //         if (xhr.readyState != 4) { return; }

  //         if (xhr.status == 200 && xhr.responseText) {
  //           var err;
  //           try {
  //             var response = JSON.parse(xhr.responseText);
  //             err = response[1];
  //           } catch(e) {
  //             err = xhr.responseText;
  //           }

  //           if (console.group) {
  //             console.group('%c' + filename + '\n', 'color: #33F; font-weight: bold');
  //             err.forEach(function (e) {
  //                 if (e.err) {
  //                   console.log('%c' + e.err.replace(/error - parse error.\s+/i, ''), 'color: #F55');
  //                   console.log('%c' + e.line + ':%c' + e.code[0], 'color: #393', 'color: #444');
  //                   console.log(new Array(('' + e.line).length + 2).join(' ') + e.code[1]);
  //                 } else {
  //                   console.log('%c ' + e.code.join('\n'), 'color: #F55');
  //                 }
  //               });
  //             console.groupEnd();
  //           } else {
  //             console.log(filename);
  //             err.forEach(function (e) {
  //                 if (e.err) {
  //                   console.log(e.err.replace(/error - parse error.\s+/i, ''));
  //                   console.log(e.line + ':' + e.code[0]);
  //                   console.log(new Array(('' + e.line).length + 2).join(' ') + e.code[1]);
  //                 } else {
  //                   console.log(e.code.join('\n'));
  //                 }
  //               });
  //           }

  //           document.body.innerHTML = '<pre style=\'margin-left: 10px; font: bold 12px Consolas, "Bitstream Vera Sans Mono", Monaco, "Lucida Console", Terminal, monospace; color: #FFF;\'>'
  //             + '<span style="color:#AAF">' + filename + '</span>\n\n'
  //             + err.map(function (e) {
  //                 if (e.err) {
  //                   return '<span style="color:#F55">' + e.err.replace(/error - parse error.\s+/i, '') + '</span>\n'
  //                     + ' <span style="color:#5F5">' + e.line + '</span>: '
  //                       + ' <span style="color:#EEE">' + e.code[0] + '</span>\n'
  //                       + new Array(('' + e.line).length + 5).join(' ') + e.code[1];
  //                 } else {
  //                   return'<span style="color:#F55">' + e.code.join('\n') + '</span>';
  //                 }
  //               }).join('\n')
  //             + '</pre>';
  //         } else if (xhr.status > 0) {
  //           originalSyntax(code, filename);
  //         }
  //       }

  //       xhr.send('javascript=' + encodeURIComponent(code));
  //     }
  //   };

  //   if (device.isMobileBrowser) {
  //     // conn.initLogProxy();
  //     // conn.initRemoteEval();
  //   }

  //   initDebugging();
  // }

  GC.buildApp('launchUI');
}
