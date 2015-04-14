var _cacheWorker;

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('cache-worker.js').then(function(reg) {

    // try to grab the just-registered worker to send it the cache message
    _cacheWorker = reg.installing || reg.waiting || reg.active;

    if (reg.installing) {
      console.log('cache worker installing...');
    } else if (reg.waiting) {
      console.log('cache worker waiting to activate (close, then reopen app)');
    } else if (reg.active) {
      console.log('cache worker already active!');
    } else {
      console.error('unknown cache worker state?');
    }

    // cache spritesheets
    import ui.resource.loader;
    var map = ui.resource.loader.getMap();
    var urls = {};
    for (var uri in map) {
      if (map[uri].sheet) {
        urls[map[uri].sheet] = true;
      }
    }

    sendMessage({
        command: 'add',
        urls: Object.keys(urls)
      })
      .then(function (res) {
        console.log('spritesheets now available offline');

        if (res && res.failedURLs) {
          console.error('following spritesheets failed to load:',
                        res.failedURLs);
        }
      });
  }, function(err) {
    console.log('cache worker failed', err);
  });
}

// from https://github.com/GoogleChrome/samples/blob/gh-pages/service-worker/post-message/index.html
function sendMessage(message) {
  // This wraps the message posting/response in a promise, which will resolve if the response doesn't
  // contain an error, and reject with the error if it does. If you'd prefer, it's possible to call
  // controller.postMessage() and set up the onmessage handler independently of a promise, but this is
  // a convenient wrapper.
  return new Promise(function(resolve, reject) {
    var messageChannel = new MessageChannel();
    messageChannel.port1.onmessage = function(event) {
      if (event.data.error) {
        reject(event.data.error);
      } else {
        resolve(event.data);
      }
    };

    if (!_cacheWorker) {
      reject(new Error('no worker found'));
    }

    // This sends the message data as well as transferring messageChannel.port2 to the service worker.
    // The service worker can then use the transferred port to reply via postMessage(), which
    // will in turn trigger the onmessage handler on messageChannel.port1.
    // See https://html.spec.whatwg.org/multipage/workers.html#dom-worker-postmessage
    _cacheWorker.postMessage(message, [messageChannel.port2]);
  });
}
