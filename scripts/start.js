'use strict';

// Startet Julia mit Electron. ELECTRON_RUN_AS_NODE wird entfernt: Manche
// Umgebungen (z. B. Shells aus VS Code heraus) vererben die Variable, dann
// liefe Electron als reines Node und Julia startete nicht.

const { spawn } = require('child_process');
const path = require('path');

const electron = require('electron');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const kind = spawn(electron, [path.join(__dirname, '..'), ...process.argv.slice(2)], { stdio: 'inherit', env, windowsHide: false });
kind.on('close', (code) => process.exit(code ?? 0));
