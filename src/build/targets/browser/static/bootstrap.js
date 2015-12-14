window.GC_LOADER = (function (window) {
  var document = window.document;
  var userAgent = navigator.userAgent;
  var CONFIG = window.CONFIG;
  var mobile = /(iPod|iPhone|iPad)/i
      .test(userAgent) ? 'ios'
      : /BlackBerry/.test(userAgent) ? 'blackberry'
      : /Mobile Safari/.test(userAgent) ? 'android'
      : '';

  var iosVersion;
  if (mobile == 'ios') {
    // detect ios operating system version
    var match = userAgent.match(/iPhone OS ([0-9]+)/);
    iosVersion = match && parseInt(match[1]);
  }

  if (window.CONFIG.CDNURL) {
    document.write('<base href="' + window.CONFIG.CDNURL + '">');
  }

  var loadApp;
  var onLoadApp;

  var controller = {
    startTime: Date.now(),
    init: function (target) {
      controller.scriptName = target + '.js';
      var pipeline = controller.pipeline;
      var index = 0;
      var phase = 0;
      nextPhase();

      function nextPhase() {
        ++phase;

        var step = pipeline[index];
        if (!step) { return; }

        var tasks = [];
        do {
          try {
            console.log(phase + ' (' + (Date.now() - controller.startTime) + '): ' + step.name);
            tasks.push(step.call())
          } catch (e) {
            console.error(step.name, 'failed', e.stack || e);
          }

          ++index;
          step = pipeline[index];
        } while (step && step.parallel);

        return Promise.all(tasks)
          .then(nextPhase);
      }
    },
    fetchApp: function (src) {
      if (!loadApp) {
        var el = document.createElement('script');
        el.src = src;
        document.getElementsByTagName('head')[0].appendChild(el);
        loadApp = new Promise(function (resolve) {
          onLoadApp = resolve;
        });
      }

      return loadApp;
    },
    addStep: function (name, cb) {
      this.pipeline.push({name: name, call: cb});
    },
    getStepIndex: function (name) {
      for (var i = this.pipeline.length - 1; i >= 0; --i) {
        if (this.pipeline[i].name === name) {
          return i;
        }
      }
    },
    pipeline: [{
        name: 'override-config',
        parallel: true,
        call: function () {
          // override any config params provided already
          if (window.CONFIG_OVERRIDES) {
            for (var key in window.CONFIG_OVERRIDES) {
              window.CONFIG[key] = window.CONFIG_OVERRIDES[key];
            }
          }

          var uri = decodeURIComponent((window.location.search || '?').substr(1));
          if (uri[0] == '{') {
            // override any config params in the URL
            var overrideCONFIG = JSON.parse(uri);
            if (overrideCONFIG) {
              for (var key in overrideCONFIG) {
                window.CONFIG[key] = overrideCONFIG[key];
              }
            }
          }
        }
      },
      {
        name: 'fetch-js',
        parallel: true,
        call: function () {
          var el = document.createElement('script');
          el.src = controller.scriptName;
          document.getElementsByTagName('head')[0].appendChild(el);
          return new Promise(function (resolve) {
              controller.onLoadApp = resolve;
            })
            .then(function (initialImport) {
              controller.initialImport = initialImport;
            });
        }
      },
      {
        name: 'load-fonts',
        parallel: true,
        call: function () {
          if (!CONFIG.embeddedFonts || !CONFIG.embeddedFonts.length) { return; }

          var TIMEOUT = 10000;
          var defaultWidth = 0;
          var parent = document.body;
          var fontNodes = CONFIG.embeddedFonts.map(function (font) {
            var el = parent.appendChild(document.createElement('span'));
            el.innerHTML = 'giItT1WQy@!-/#';
            el.style.cssText = 'position:absolute;left:-9999px;font-size:100px;visibility:hidden;';
            if (!defaultWidth) {
              defaultWidth = el.offsetWidth;
            }
            el.style.fontFamily = font;
            return el;
          });

          return new Promise(function (resolve) {
            function onFinish() {
              clearInterval(interval);
              clearTimeout(timeout);
              fontNodes.map(function (el) { parent.removeChild(el); });
              resolve();
            }

            var timeout = setTimeout(onFinish, TIMEOUT);
            var interval = setInterval(function () {
              var isLoaded = true;
              for (var i = 0, n = fontNodes.length; i < n; ++i) {
                if (fontNodes[i].offsetWidth == defaultWidth) {
                    isLoaded = false;
                    break;
                }
              }

              if (isLoaded) { onFinish(); }
            }, 50);
          });
        }
      },
      {
        name: 'orientation-wait',
        parallel: false,
        call: function () {
          if (!controller.isOrientationValid) {
            return new Promise(function (resolve) {
              controller.onOrientation = function (isValid) {
                if (isValid) {
                  controller.onOrientation = null;
                  resolve();
                }
              };
            });
          }
        }
      },
      {
        name: 'start-app',
        parallel: false,
        call: function () {
          jsio(controller.initialImport);
        }
      }
    ]
  };

  return controller;
})(window);


// minimal Promise polyfill from https://github.com/taylorhakes/promise-polyfill

/**
* Copyright (c) 2014 Taylor Hakes
* Copyright (c) 2014 Forbes Lindesay
*
* Permission is hereby granted, free of charge, to any person obtaining a copy
* of this software and associated documentation files (the "Software"), to deal
* in the Software without restriction, including without limitation the rights
* to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
* copies of the Software, and to permit persons to whom the Software is
* furnished to do so, subject to the following conditions:
*
* The above copyright notice and this permission notice shall be included in
* all copies or substantial portions of the Software.
*
* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
* IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
* FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
* AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
* LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
* OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
* THE SOFTWARE.
**/
if (!window.Promise) {
  window.Promise = (function() {

    // Use polyfill for setImmediate for performance gains
    var asap = (typeof setImmediate === 'function' && setImmediate) ||
      function(fn) { setTimeout(fn, 1); };

    // Polyfill for Function.prototype.bind
    function bind(fn, thisArg) {
      return function() {
        fn.apply(thisArg, arguments);
      }
    }

    var isArray = Array.isArray || function(value) { return Object.prototype.toString.call(value) === "[object Array]" };

    function Promise(fn) {
      if (typeof this !== 'object') throw new TypeError('Promises must be constructed via new');
      if (typeof fn !== 'function') throw new TypeError('not a function');
      this._state = null;
      this._value = null;
      this._deferreds = []

      doResolve(fn, bind(resolve, this), bind(reject, this))
    }

    function handle(deferred) {
      var me = this;
      if (this._state === null) {
        this._deferreds.push(deferred);
        return
      }
      asap(function() {
        var cb = me._state ? deferred.onFulfilled : deferred.onRejected
        if (cb === null) {
          (me._state ? deferred.resolve : deferred.reject)(me._value);
          return;
        }
        var ret;
        try {
          ret = cb(me._value);
        }
        catch (e) {
          deferred.reject(e);
          return;
        }
        deferred.resolve(ret);
      })
    }

    function resolve(newValue) {
      try { //Promise Resolution Procedure: https://github.com/promises-aplus/promises-spec#the-promise-resolution-procedure
        if (newValue === this) throw new TypeError('A promise cannot be resolved with itself.');
        if (newValue && (typeof newValue === 'object' || typeof newValue === 'function')) {
          var then = newValue.then;
          if (typeof then === 'function') {
            doResolve(bind(then, newValue), bind(resolve, this), bind(reject, this));
            return;
          }
        }
        this._state = true;
        this._value = newValue;
        finale.call(this);
      } catch (e) { reject.call(this, e); }
    }

    function reject(newValue) {
      this._state = false;
      this._value = newValue;
      finale.call(this);
    }

    function finale() {
      for (var i = 0, len = this._deferreds.length; i < len; i++) {
        handle.call(this, this._deferreds[i]);
      }
      this._deferreds = null;
    }

    function Handler(onFulfilled, onRejected, resolve, reject){
      this.onFulfilled = typeof onFulfilled === 'function' ? onFulfilled : null;
      this.onRejected = typeof onRejected === 'function' ? onRejected : null;
      this.resolve = resolve;
      this.reject = reject;
    }

    /**
     * Take a potentially misbehaving resolver function and make sure
     * onFulfilled and onRejected are only called once.
     *
     * Makes no guarantees about asynchrony.
     */
    function doResolve(fn, onFulfilled, onRejected) {
      var done = false;
      try {
        fn(function (value) {
          if (done) return;
          done = true;
          onFulfilled(value);
        }, function (reason) {
          if (done) return;
          done = true;
          onRejected(reason);
        })
      } catch (ex) {
        if (done) return;
        done = true;
        onRejected(ex);
      }
    }

    Promise.prototype['catch'] = function (onRejected) {
      return this.then(null, onRejected);
    };

    Promise.prototype.then = function(onFulfilled, onRejected) {
      var me = this;
      return new Promise(function(resolve, reject) {
        handle.call(me, new Handler(onFulfilled, onRejected, resolve, reject));
      })
    };

    Promise.all = function () {
      var args = Array.prototype.slice.call(arguments.length === 1 && isArray(arguments[0]) ? arguments[0] : arguments);

      return new Promise(function (resolve, reject) {
        if (args.length === 0) return resolve([]);
        var remaining = args.length;
        function res(i, val) {
          try {
            if (val && (typeof val === 'object' || typeof val === 'function')) {
              var then = val.then;
              if (typeof then === 'function') {
                then.call(val, function (val) { res(i, val) }, reject);
                return;
              }
            }
            args[i] = val;
            if (--remaining === 0) {
              resolve(args);
            }
          } catch (ex) {
            reject(ex);
          }
        }
        for (var i = 0; i < args.length; i++) {
          res(i, args[i]);
        }
      });
    };

    Promise.resolve = function (value) {
      if (value && typeof value === 'object' && value.constructor === Promise) {
        return value;
      }

      return new Promise(function (resolve) {
        resolve(value);
      });
    };

    Promise.reject = function (value) {
      return new Promise(function (resolve, reject) {
        reject(value);
      });
    };

    Promise.race = function (values) {
      return new Promise(function (resolve, reject) {
        for(var i = 0, len = values.length; i < len; i++) {
          values[i].then(resolve, reject);
        }
      });
    };

    /**
     * Set the immediate function to execute callbacks
     * @param fn {function} Function to execute
     * @private
     */
    Promise._setImmediateFn = function _setImmediateFn(fn) {
      asap = fn;
    };

    return Promise;
  })(this);
}
