import Phaser from 'phaser'
import Boot from './scenes/Boot'
import Menu from './scenes/Menu'
import Play from './scenes/Play'
import GameOver from './scenes/GameOver'

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#222',
  pixelArt: true,
  scene: [Boot, Menu, Play, GameOver],
  parent: 'app',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

const game = new Phaser.Game(config);

window.addEventListener('resize', () => {
  game.scale.resize(window.innerWidth, window.innerHeight);
});
