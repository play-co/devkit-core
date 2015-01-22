chrome.app.runtime.onLaunched.addListener(function() {
  // chrome.storage.local.get = function();

  chrome.app.window.create('pageWrapper.html', {
    'bounds': {
      'width': %(width)s,
      'height': %(height)s
    }
  });
});
