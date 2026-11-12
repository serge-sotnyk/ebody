"""Record how PyElectroMan moves the hero for given key sequences.

Usage: python trace_hero.py <pyelectroman dir> <scenarios.json> <output.json>

Each scenario names a level, a tile to stand on and one controller bit mask
per tick (1 left, 2 right, 4 up, 8 down). The hero is run with PyElectroMan's
own PlayerEntity, headless, and its screen, position, state and animation are
written for every tick. tools/reference/verify-hero.ts compares them with our
simulation. Needs pygame.

Of the touched objects only teleports are handled; enemies, weapons, the
HUD and the other touch types are switched off until later steps port them.
A scenario ends when the hero dies.
"""

import json
import os
import sys

UPDATED = {"Cycle", "CyclePlus", "Pulse", "PulsePlus", "Flash", "FlashPlus",
           "FlashSpecial", "Monitor", "KillingFloor"}
NOT_YET = ("check_enemy_collision", "show_hud", "power_and_cooldown")
TELEPORT = 2


class Pad:
    left = right = up = down = fire = debug = False


def main():
    root = os.path.abspath(sys.argv[1])
    scenarios_path, output = os.path.abspath(sys.argv[2]), os.path.abspath(sys.argv[3])
    os.environ["PYGAME_HIDE_SUPPORT_PROMPT"] = "1"
    os.environ["SDL_VIDEODRIVER"] = "dummy"
    os.environ["SDL_AUDIODRIVER"] = "dummy"
    os.chdir(root)
    sys.path.insert(0, root)
    import logging
    logging.disable(logging.CRITICAL)
    import pygame
    pygame.init()
    pygame.display.set_mode((640, 480))
    import emglobals as gl
    import emdata as da
    import emdisplay as di
    import emgame as ga
    import emhero as pl
    import emother as ot
    import emsound as snd
    from emglobals import XY

    di.message = lambda *args, **kwargs: None
    snd.play_sound = lambda *args, **kwargs: None
    for name in NOT_YET:
        setattr(pl.PlayerEntity, name, lambda self: None)
    handle_touch = pl.PlayerEntity.handle_touch

    def handle_teleports_only(self):
        self.touched = [o for o in self.touched if o.get_touch() == TELEPORT]
        handle_touch(self)

    pl.PlayerEntity.handle_touch = handle_teleports_only

    gl.data_folder = "data"
    gl.enemies = ot.Enemies()
    gl.weapons = ot.Weapons()
    gl.info = ot.Info()
    gl.checkpoint = ga.ActiveCheckpoint()

    with open(scenarios_path) as f:
        scenarios = json.load(f)
    results = []
    for sc in scenarios:
        level = da.Level()
        level.load(sc["level"])
        gl.level = level
        gl.current_level = gl.level_names.index(sc["level"])
        gl.screen_manager = ga.ScreenManager()
        gl.screen_manager.add_screens(level.get_screens())
        gl.killing_floor = False
        pad = Pad()
        player = pl.PlayerEntity(pad)
        gl.player = player
        gl.screen_manager.change_screen(sc["screen"])
        player.stand(XY(sc["x"] * 2 + 24, sc["y"] * 2 + 48))
        rows = []
        for bits in sc["inputs"]:
            pad.left, pad.right = bool(bits & 1), bool(bits & 2)
            pad.up, pad.down = bool(bits & 4), bool(bits & 8)
            gl.screen = gl.screen_manager.get_screen()
            if gl.screen:
                for a in list(gl.screen.active):
                    if a.name() in UPDATED:
                        a.update()
            player.update()
            rows.append([gl.screen_manager.get_screen_number(), player.position.x / 2,
                         player.position.y / 2, player.state.__name__[6:],
                         player.anim, player.frame, player.orientation])
            if player.state == player.state_death:
                break
        results.append(rows)
    with open(output, "w") as f:
        json.dump(results, f, separators=(",", ":"))


if __name__ == "__main__":
    main()
