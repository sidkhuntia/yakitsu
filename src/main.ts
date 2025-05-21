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
  // dom: { createContainer: true }, // Removed DOM plugin for outside fullscreen button
};

const game = new Phaser.Game(config);

// --- Fullscreen Button Logic ---
window.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('fullscreen-btn');
  const getCanvas = () => document.querySelector('#app canvas') as HTMLCanvasElement | null;

  if (btn) {
    btn.addEventListener('click', async () => {
      const canvas = getCanvas();
      if (!canvas) return;
      if (!document.fullscreenElement) {
        await canvas.requestFullscreen();
        canvas.classList.add('fullscreen-canvas');
        btn.textContent = 'Exit Full Screen';
      } else {
        await document.exitFullscreen();
        canvas.classList.remove('fullscreen-canvas');
        btn.textContent = 'Full Screen';
      }
    });
  }

  document.addEventListener('fullscreenchange', () => {
    const canvas = getCanvas();
    if (!canvas) return;
    if (!document.fullscreenElement) {
      canvas.classList.remove('fullscreen-canvas');
      if (btn) btn.textContent = 'Full Screen';
    } else {
      canvas.classList.add('fullscreen-canvas');
      if (btn) btn.textContent = 'Exit Full Screen';
    }
  });
});
