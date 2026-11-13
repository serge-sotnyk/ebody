"""Record how PyElectroMan runs each screen's objects, tick by tick, without a hero.

Usage: python trace_objects.py <pyelectroman dir> <ticks> <output.json>

For every screen with objects in every game level, runs PyElectroMan's object
classes headless (pyem.py, with the fixes listed there) and writes every
object on the screen after each tick, coded as 'x,y:sprite'.
tools/reference/verify-objects.ts compares this with our simulation.
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pyem  # noqa: E402


def main():
    root, ticks = os.path.abspath(sys.argv[1]), int(sys.argv[2])
    output = os.path.abspath(sys.argv[3])
    m = pyem.boot(root)
    pyem.patch(m)
    gl, da, ga = m.gl, m.da, m.ga
    gl.player = None

    out = {}
    for name in gl.level_names[:8]:
        level = da.Level()
        level.load(name)
        code = pyem.object_coder(m, level)
        gl.level = level
        screens = {}
        for s in range(256):
            gl.screen_manager = ga.ScreenManager()
            gl.screen_manager.add_screens(level.get_screens())
            gl.screen_manager.change_screen(s)
            screen = gl.screen_manager.get_screen()
            if not screen or not screen.active:
                continue
            gl.screen = screen
            frames = []
            for _ in range(ticks + 1):
                frames.append(" ".join(code(a) for a in screen.active))
                pyem.update_objects(gl)
                pyem.end_tick(gl)
            screens[s] = frames
        out[name] = screens
    with open(output, "w") as f:
        json.dump(out, f, separators=(",", ":"))


if __name__ == "__main__":
    main()
