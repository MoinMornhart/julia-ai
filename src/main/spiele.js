'use strict';

// Läuft im Vordergrund gerade ein Spiel? Dann erscheint das Gaming-Overlay von
// selbst. Erkannt wird am Installationsort (Steam, Epic, Riot …), an bekannten
// Spielen und an Programmen, die der Nutzer selbst einträgt. Die Launcher
// selbst zählen nicht – sie liegen oft im selben Ordner wie die Spiele.

const SPIEL_ORDNER = [
  /[\\/]steamapps[\\/]common[\\/]/i,
  /[\\/]Epic Games[\\/](?!Launcher[\\/])/i,
  /[\\/]Riot Games[\\/](?!Riot Client[\\/])/i,
  /[\\/](Battle\.net|Blizzard Entertainment)[\\/]/i,
  /[\\/](EA Games|Electronic Arts)[\\/](?!EA Desktop[\\/])/i,
  /[\\/]Ubisoft Game Launcher[\\/]games[\\/]/i,
  /[\\/](GOG Galaxy[\\/]Games|GOG Games)[\\/]/i,
  /[\\/]XboxGames[\\/]/i,
  /[\\/]Rockstar Games[\\/](?!Launcher[\\/])/i,
  /[\\/]Amazon Games[\\/]Library[\\/]/i,
  /[\\/]Origin Games[\\/]/i,
];

const LAUNCHER = /^(steam|steamwebhelper|steamservice|epicgameslauncher|epicwebhelper|riotclientservices|riotclientux|riotclientuxrender|battle\.net|agent|eadesktop|eabackgroundservice|origin|upc|ubisoftconnect|galaxyclient|rockstarlauncher|launcher|amazon games|crashreportclient|unrealcefsubprocess)$/i;

// Ohne Pfad (Anti-Cheat verbirgt ihn oft) hilft der Programmname.
const BEKANNTE = /^(minecraft\.windows|robloxplayerbeta|fortniteclient-win64-shipping|valorant-win64-shipping|league of legends|cs2|csgo|r5apex|r5apex_dx12|overwatch|gta5|gta5_enhanced|rocketleague|eldenring|cyberpunk2077|witcher3|bf2042|destiny2|dota2|tslgame|genshinimpact|starrail|zenlesszonezero|palworld-win64-shipping|terraria|stardew valley|hollow_knight|among us|fallguys_client_game|deadbydaylight-win64-shipping|rainbowsix|rainbowsix_vulkan|forzahorizon5|helldivers2)$/i;

function programmName(p) {
  return String(p || '').trim().replace(/\.exe$/i, '').toLowerCase();
}

// v: { programm, pfad, titel } des Vordergrundfensters.
// Liefert { spiel: true, name } oder { spiel: false }.
function istSpiel(v = {}, eigene = []) {
  const name = programmName(v.programm);
  if (!name) return { spiel: false };
  if ((eigene || []).map(programmName).includes(name)) return { spiel: true, name };
  if (LAUNCHER.test(name)) return { spiel: false };
  // Minecraft Java läuft als javaw – erkennbar am Fenstertitel.
  if (/^javaw?$/.test(name)) return /^Minecraft\b/i.test(String(v.titel || '')) ? { spiel: true, name: 'minecraft' } : { spiel: false };
  if (BEKANNTE.test(name)) return { spiel: true, name };
  if (v.pfad && SPIEL_ORDNER.some((m) => m.test(v.pfad))) return { spiel: true, name };
  return { spiel: false };
}

module.exports = { istSpiel, programmName };
