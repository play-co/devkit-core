function string(value) {
  return '\'' + value
      .replace(/\\/g, '\\\\')
      .replace(/\'/g, '\\\'')
    + '\'';
}

exports.generate = function (config, js) {
  var keys = {
    'APP_ID': string(config.appID),
    'APP_VERSION': string(config.version),
    'ALLOW_MULTIPLE_APPS_PER_DOMAIN': false,
    'BASE_URLS': [
      string('index.html'),
      string(config.target + '.js')
    ]
  };

  Object.keys(keys).forEach(function (key) {
    var value = keys[key];
    js = js.replace(new RegExp('["\']INSERT:' + key + '["\']', 'g'), value);
  });

  return js;
};
