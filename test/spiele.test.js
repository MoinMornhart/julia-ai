'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { istSpiel } = require('../src/main/spiele');
const { STANDARD, pruefen } = require('../src/main/config');

test('Spiele: am Installationsort, an bekannten Namen, an der eigenen Liste – Launcher nicht', () => {
  assert.equal(istSpiel({ programm: 'eldenring', pfad: 'D:\\SteamLibrary\\steamapps\\common\\ELDEN RING\\Game\\eldenring.exe' }).spiel, true);
  assert.equal(istSpiel({ programm: 'steam', pfad: 'C:\\Program Files (x86)\\Steam\\steam.exe' }).spiel, false);
  assert.equal(istSpiel({ programm: 'EpicGamesLauncher', pfad: 'C:\\Program Files (x86)\\Epic Games\\Launcher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe' }).spiel, false);
  assert.equal(istSpiel({ programm: 'FortniteClient-Win64-Shipping', pfad: 'C:\\Program Files\\Epic Games\\Fortnite\\FortniteGame\\Binaries\\Win64\\FortniteClient-Win64-Shipping.exe' }).spiel, true);
  assert.equal(istSpiel({ programm: 'VALORANT-Win64-Shipping', pfad: '' }).spiel, true, 'ohne Pfad (Anti-Cheat) am Namen');
  assert.equal(istSpiel({ programm: 'RiotClientServices', pfad: 'C:\\Riot Games\\Riot Client\\RiotClientServices.exe' }).spiel, false);
  assert.equal(istSpiel({ programm: 'javaw', titel: 'Minecraft 1.21.11 - Mehrspieler' }).spiel, true);
  assert.equal(istSpiel({ programm: 'javaw', titel: 'IntelliJ IDEA' }).spiel, false);
  assert.equal(istSpiel({ programm: 'chrome', pfad: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' }).spiel, false);
  assert.equal(istSpiel({ programm: 'MeinIndieSpiel', pfad: 'D:\\Spiele\\MeinIndieSpiel.exe' }, ['meinindiespiel.exe']).spiel, true);
  assert.equal(istSpiel({}).spiel, false);
});

test('Overlay von selbst: standardmäßig an, eigene Spiele als Programmnamen', () => {
  assert.equal(STANDARD.overlay.automatisch, true);
  assert.deepEqual(STANDARD.overlay.spiele, []);
  assert.deepEqual(pruefen('overlay.spiele', 'valorant.exe\n eldenring \nvalorant'), ['valorant', 'eldenring']);
  assert.deepEqual(pruefen('overlay.spiele', ''), []);
  assert.throws(() => pruefen('overlay.spiele', 'C:\\Spiele\\pfad.exe'), /Programmname/);
  assert.equal(pruefen('overlay.automatisch', false), false);
});
