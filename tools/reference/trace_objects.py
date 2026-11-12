"""Record how PyElectroMan animates level objects, tick by tick.

Usage: python trace_objects.py <pyelectroman dir> <ticks> <output.json>

Runs PyElectroMan's own level loader and object classes headless (SDL dummy
drivers) and writes, for every screen of every game level, the sprite each
object shows after each tick (null when hidden). tools/reference/verify-objects.ts
compares this with our simulation. Needs pygame.

Only the classes ported so far are updated; others are recorded as they are
placed. Objects are updated over a copy of the list, because PyElectroMan
removes vanishing objects while iterating and skips the next one's update
(a bug we do not port).
"""

import json
import os
import sys

UPDATED = {"Cycle", "CyclePlus", "Pulse", "PulsePlus", "Flash", "FlashPlus",
           "FlashSpecial", "Monitor", "KillingFloor"}


def main():
    root, ticks = os.path.abspath(sys.argv[1]), int(sys.argv[2])
    output = os.path.abspath(sys.argv[3])
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
    import emgame as ga
    import emother as ot

    gl.data_folder = "data"
    gl.enemies = ot.Enemies()
    gl.info = ot.Info()
    gl.checkpoint = ga.ActiveCheckpoint()

    out = {}
    for name in gl.level_names[:8]:
        level = da.Level()
        level.load(name)
        index = {}
        for base, sset in ((0, level.set1), (64, level.set2)):
            for i, sprite in enumerate(sset.sprites):
                if sprite is not None:
                    index[id(sprite)] = base + i

        def shown(entity):
            if getattr(entity, "show", True) is False:
                return None
            return index[id(entity.sprites[entity.frame])]

        screens = {}
        for s in range(256):
            gl.screen_manager = ga.ScreenManager()
            gl.screen_manager.add_screens(level.get_screens())
            gl.screen_manager.change_screen(s)
            screen = gl.screen_manager.get_screen()
            if not screen or not screen.active:
                continue
            frames = []
            for _ in range(ticks + 1):
                frames.append([[a.name(), a.position.x // 2, a.position.y // 2, shown(a)]
                               for a in screen.active])
                for a in list(screen.active):
                    if a.name() in UPDATED:
                        a.update()
            screens[s] = frames
        out[name] = screens
    with open(output, "w") as f:
        json.dump(out, f, separators=(",", ":"))


if __name__ == "__main__":
    main()
