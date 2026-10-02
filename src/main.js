import './ui/styles.css';
import { Game } from './game/game.js';

const canvas = document.getElementById('gl');
const game = new Game(canvas);
window.leocart = game; // handy for debugging and the end-to-end test
game.start();
