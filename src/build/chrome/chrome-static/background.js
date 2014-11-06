chrome.app.runtime.onLaunched.addListener(function() {
  chrome.app.window.create('index.html', {
    'bounds': {
      'width': %(width)s,
      'height': %(height)s
    }
  });
});