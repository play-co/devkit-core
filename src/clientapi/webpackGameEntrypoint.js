  // TODO: Per platform
const devkitLaunch = require('timestepInit/launchClient');
// const devkitLaunch = require('timestepInit/launchClient');

export const startGame = ApplicationCtor => {
  devkitLaunch.startGame(ApplicationCtor);
};
