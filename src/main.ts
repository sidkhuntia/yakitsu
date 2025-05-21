import Phaser from 'phaser'
import Boot from './scenes/Boot'
import Menu from './scenes/Menu'
import Play from './scenes/Play'
import GameOver from './scenes/GameOver'

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  backgroundColor: '#222',
  pixelArt: true,
  scene: [Boot, Menu, Play, GameOver],
  parent: 'app',
};

const game = new Phaser.Game(config);
