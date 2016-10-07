export const startGame = (ApplicationCtor) => {
  // TODO: Per platform
  var devkitLaunch = require('timestepInit/launchClient');
  devkitLaunch.startGame(ApplicationCtor);
};
