"""Record how PyElectroMan moves the hero for given key sequences.

Usage: python trace_hero.py <pyelectroman dir> <scenarios.json> <output.json>

Each scenario names a level, a tile to stand on, optionally a weapon level,
and one controller bit mask per tick (1 left, 2 right, 4 up, 8 down, 16 fire).
The hero is run with PyElectroMan's own PlayerEntity, headless, and its
screen, position, state, animation, weapon power, ammo and heat, the disk
count, the checkpoint screen and every object on the screen are written for
every tick. tools/reference/verify-hero.ts compares them with our simulation.
Needs pygame.

Enemies and the HUD are switched off until later steps port them; saving at
checkpoints is stubbed out. A scenario ends at the level exit. PyElectroMan
bugs we do not port are patched out here, each where it is done.
"""

import json
import os
import sys
import types

UPDATED = {"Cycle", "CyclePlus", "Pulse", "PulsePlus", "Flash", "FlashPlus",
           "FlashSpecial", "Monitor", "KillingFloor", "Exit", "Explosion",
           "Projectile", "BrokenSprite"}
NOT_YET = ("check_enemy_collision", "show_hud")


class Pad:
    left = right = up = down = fire = debug = False


def use_teleport_order(pl, gl, ga, XY):
    """Teleports in the original's order (docs/fidelity.md G16): fade out, wait
    out of sight, move, fade in. PyElectroMan fades in first and waits after.
    Also bounds the teleport search to one round of the map column: PyElectroMan
    loops forever when a teleport has no partner in its column."""
    P = pl.PlayerEntity

    def state_teleport_out(self, init=False):
        if init:
            self.anim = "TELE"
            self.counter = self.frames[self.anim] - 1
            self.frame = 0
            return
        if self.counter == 0 and not gl.exit_level_flag:
            return self.new_state(self.state_teleport_wait)
        self.frame += 1
        self.counter -= 1

    def state_teleport_wait(self, init=False):
        if init:
            self.wait_counter = pl.TELEPORT_TIME
            return
        if self.wait_counter > 0:
            self.wait_counter -= 1
            return
        if self.teleport_target:
            if self.teleport_target[0] != gl.screen_manager.get_screen_number():
                gl.screen_manager.change_screen(self.teleport_target[0])
            self.set_position(self.teleport_target[1] + XY(0, -gl.SPRITE_Y * 2))
        self.new_state(self.state_teleport_in)

    def state_teleport_in(self, init=False):
        if init:
            self.anim = "TELE"
            self.counter = self.frames[self.anim] - 1
            self.frame = self.frames[self.anim] - 1
            return
        if self.counter == 0:
            return self.new_state(self.state_stand)
        self.frame -= 1
        self.counter -= 1

    find_teleport_target = P.find_teleport_target

    def bounded_find_teleport_target(self, start_pos):
        sn = gl.screen_manager.get_screen_number()
        column = [s for s in range(256) if s % 16 == sn % 16]
        screens = [gl.screen_manager.inspect_screen(s) for s in column]
        if any(isinstance(o, ga.Teleport) and o.get_position().x == start_pos.x
               for screen in screens if screen for o in screen.active):
            return find_teleport_target(self, start_pos)
        self.teleport_target = None

    P.state_teleport_out = state_teleport_out
    P.state_teleport_wait = state_teleport_wait
    P.state_teleport_in = state_teleport_in
    P.find_teleport_target = bounded_find_teleport_target


def patch_weapons_and_death(pl, gl, ga):
    """Shots and deaths as ported (docs/fidelity.md G15 and weapons notes)."""
    def projectile_vanish(self):
        # PyElectroMan also deletes the first level object at the shot's
        # position from the level map (Entity.vanish); a bug, not ported.
        try:
            gl.screen_manager.get_screen().active.remove(self)
        except ValueError:
            pass

    def check_all_collisions(self):
        # As PyElectroMan, but enemies are not hit yet (they come in step 8).
        screen = gl.screen_manager.get_screen()
        if not screen:
            return False
        for entity in list(screen.active):
            if entity is self or isinstance(entity, (ga.EnemyPlatform, ga.EnemyFlying)):
                continue
            if getattr(entity, "sprites", None):
                frame = min(getattr(entity, "frame", 0), len(entity.sprites) - 1)
                sprite = entity.sprites[frame]
                if sprite is not None and sprite.flag("shootable") and self.collides_with(entity):
                    self.hit_object(entity)
                    return True
        return False

    def state_death(self, init=False):
        # The original's explosion offsets, in original pixels (doubled here).
        if init:
            self.death_timer = 0
            pos = self.get_position()
            pl.put_explosion(pos.x - 4, pos.y)
            pl.put_explosion(pos.x + 2, pos.y + 46)
        self.death_timer += 1
        if self.death_timer < 10:
            pos = self.get_position()
            dx = -12 + gl.random(24)
            dy = gl.random(24)
            pl.put_explosion(pos.x + 2 * dx, pos.y + 2 * dy)
        elif self.death_timer >= 70:
            self.respawn()

    pl.Projectile.vanish = projectile_vanish
    pl.Projectile.check_all_collisions = check_all_collisions
    pl.PlayerEntity.state_death = state_death


def patch_touch_handling(pl, gl):
    """handle_touch as ported. PyElectroMan dedupes touched objects with set(),
    whose order depends on memory addresses; we keep the order they were
    touched in. And it takes the current screen number for checkpoints,
    disks, removals and teleport searches, which is wrong when the hero
    changed screens earlier in the tick; we use the screen the tick began on."""
    pl.set = lambda items: list(dict.fromkeys(items))
    P = pl.PlayerEntity
    update, handle_touch = P.update, P.handle_touch

    def update_noting_screen(self):
        self.tick_screen = gl.screen_manager.get_screen_number()
        update(self)

    def handle_touch_on_tick_screen(self):
        manager = gl.screen_manager
        manager.get_screen_number = lambda: self.tick_screen
        try:
            handle_touch(self)
        finally:
            del manager.get_screen_number

    P.update = update_noting_screen
    P.handle_touch = handle_touch_on_tick_screen


def update_objects(gl):
    """One pass over the screen's objects, the ones added during the pass
    included and removed ones skipped. PyElectroMan iterates the live list,
    which skips the object after one that removes itself (a bug, not ported)."""
    done, seen = [], set()
    while True:
        nxt = next((a for a in gl.screen.active if id(a) not in seen), None)
        if nxt is None:
            return
        done.append(nxt)  # keeps it alive, so its id is not reused
        seen.add(id(nxt))
        if nxt.name() in UPDATED:
            nxt.update()


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
    pl.TELEPORT_TIME = int(os.environ.get("TELEPORT_TIME", "12"))
    use_teleport_order(pl, gl, ga, XY)
    patch_weapons_and_death(pl, gl, ga)
    patch_touch_handling(pl, gl)
    # handle_touch saves the game at checkpoints through emmenu.
    sys.modules["emmenu"] = types.SimpleNamespace(save_current_game=lambda: False)
    # PyElectroMan bug, not ported (docs/fidelity.md G4): rebuilding the level
    # after a death resets the active checkpoint to the level start.
    reset_level = ga.ScreenManager.reset_level

    def reset_level_keeping_checkpoint(self):
        c = gl.checkpoint
        saved = (c.level, c.screen, c.position)
        reset_level(self)
        c.level, c.screen, c.position = saved

    ga.ScreenManager.reset_level = reset_level_keeping_checkpoint

    gl.data_folder = "data"
    gl.enemies = ot.Enemies()
    gl.weapons = ot.Weapons()
    gl.info = ot.Info()
    gl.checkpoint = ga.ActiveCheckpoint()

    weapon_ids = {id(s): "w%d" % i for i, s in enumerate(gl.weapons.data.sprites) if s is not None}

    with open(scenarios_path) as f:
        scenarios = json.load(f)
    results = []
    for sc in scenarios:
        level = da.Level()
        level.load(sc["level"])
        level_ids = {}
        for base, sset in ((0, level.set1), (64, level.set2)):
            for i, sprite in enumerate(sset.sprites):
                if sprite is not None:
                    level_ids[id(sprite)] = str(base + i)

        def code(a):
            if a.name() != "ExitIndicator" and getattr(a, "show", True) is False:
                shown = "-"
            else:
                sprite = a.sprites[a.frame]
                shown = level_ids.get(id(sprite)) or weapon_ids.get(id(sprite), "?")
            return "%d,%d:%s" % (a.position.x // 2, a.position.y // 2, shown)

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
                update_objects(gl)
            player.update()
            screen = gl.screen_manager.get_screen()
            if screen:
                gl.screen_manager.update_active()  # shots fired this tick join the screen
            else:
                gl.screen_manager.new_objects = []  # PyElectroMan crashes here: an empty screen
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
