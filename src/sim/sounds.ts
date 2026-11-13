// Sound effects the game logic asks for; the shell plays them (platform/audio.ts).
// Names and priorities from PyElectroMan emsound.py (EB.H:96-114, EB.C:1410-1428).

export const SOUNDS = {
  footstep: { file: 'footstep', priority: 1 },
  jump: { file: 'jump', priority: 2 },
  jumpend: { file: 'jumpend', priority: 2 },
  laser: { file: 'laser', priority: 3 },
  shoot1: { file: 'wpn_1', priority: 4 },
  shoot2: { file: 'wpn_2', priority: 4 },
  shoot3: { file: 'wpn_3', priority: 4 },
  shoot4: { file: 'wpn_4', priority: 4 },
  shoot5: { file: 'wpn_5', priority: 4 },
  shoot: { file: 'shoot', priority: 4 },
  warning: { file: 'warning', priority: 4 },
  warning2: { file: 'warning2', priority: 4 },
  battery: { file: 'battery', priority: 6 },
  teleport: { file: 'teleport', priority: 7 },
  blast: { file: 'xplosion', priority: 8 },
  checkp: { file: 'checkp', priority: 9 },
  disk: { file: 'disk', priority: 9 },
  area: { file: 'area', priority: 9 },
  ask: { file: 'ask', priority: 9 },
} as const;

export type SoundName = keyof typeof SOUNDS;
