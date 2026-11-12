"""Record how PyElectroMan plays given key sequences.

Usage: python trace_hero.py <pyelectroman dir> <scenarios.json> <output.json>

Each scenario names a level, a tile to stand on, optionally disks collected
and a weapon level, and one controller bit mask per tick (1 left, 2 right,
4 up, 8 down, 16 fire). PyElectroMan's own PlayerEntity and objects run
headless (pyem.py, with the fixes listed there), and for every tick this
writes the hero's screen, position, state, animation, weapon level, ammo and
heat, the disk count, the checkpoint screen and every object on the screen.
tools/reference/verify-hero.ts compares that with our simulation. A scenario
ends at the level exit.
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pyem  # noqa: E402


class Pad:
    left = right = up = down = fire = debug = False


def main():
    root = os.path.abspath(sys.argv[1])
    scenarios_path, output = os.path.abspath(sys.argv[2]), os.path.abspath(sys.argv[3])
    m = pyem.boot(root)
    pyem.patch(m, int(os.environ.get("TELEPORT_TIME", "12")))
    gl, da, ga, pl, XY = m.gl, m.da, m.ga, m.pl, m.XY

    with open(scenarios_path) as f:
        scenarios = json.load(f)
    results = []
    for sc in scenarios:
        level = da.Level()
        level.load(sc["level"])
        code = pyem.object_coder(m, level)
        gl.level = level
        gl.current_level = gl.level_names.index(sc["level"])
        gl.screen_manager = ga.ScreenManager()
        gl.screen_manager.add_screens(level.get_screens())
        gl.killing_floor = False
        gl.disks = sc.get("disks", 0)
        gl.disk_positions = []
        gl.exit_level_flag = False
        pad = Pad()
        player = pl.PlayerEntity(pad)
        gl.player = player
        gl.screen_manager.change_screen(sc["screen"])
        player.stand(XY(sc["x"] * 2 + 24, sc["y"] * 2 + 48))
        if sc.get("power"):
            player.select_weapon(sc["power"])
        rows = []
        for bits in sc["inputs"]:
            pad.left, pad.right = bool(bits & 1), bool(bits & 2)
            pad.up, pad.down = bool(bits & 4), bool(bits & 8)
            pad.fire = bool(bits & 16)
            gl.screen = gl.screen_manager.get_screen()
            if gl.screen:
                pyem.update_objects(gl)
            player.update()
            pyem.end_tick(gl)
            screen = gl.screen_manager.get_screen()
            rows.append([gl.screen_manager.get_screen_number(), player.position.x / 2,
                         player.position.y / 2, player.state.__name__[6:],
                         player.anim, player.frame, player.orientation,
                         player.power, player.ammo, player.temp, gl.disks,
                         gl.checkpoint.get_screen(),
                         " ".join(code(a) for a in screen.active) if screen else ""])
            if gl.exit_level_flag:
                break
        results.append(rows)
    with open(output, "w") as f:
        json.dump(results, f, separators=(",", ":"))


if __name__ == "__main__":
    main()
