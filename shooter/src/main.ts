import './style.css';
import * as THREE from 'three';
import { Game } from './game/game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const game = new Game(canvas);
(window as unknown as { __game: Game }).__game = game;
game.boot();
if (new URLSearchParams(location.search).has('debug')) (window as unknown as { THREE: typeof THREE }).THREE = THREE;
import { audio } from './engine/audio';
if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __audio: typeof audio }).__audio = audio;
