"""PyElectroMan run headless, as the reference for our game logic.

Shared by trace_objects.py and trace_hero.py. boot() imports PyElectroMan with
SDL's dummy drivers; patch() switches off what we do not compare (sound, the
on-screen HUD, saving) and fixes the PyElectroMan bugs and deviations we do not
port, each documented where it is done and in docs/fidelity.md. Needs pygame.
"""

import os
import sys
import types

# Classes whose update() runs each tick (everything else stays as placed).
UPDATED = {"Cycle", "CyclePlus", "Pulse", "PulsePlus", "Flash", "FlashPlus",
           "FlashSpecial", "Monitor", "KillingFloor", "Exit", "Explosion",
           "Projectile", "BrokenSprite", "EnemyPlatform", "EnemyFlying",
           "EnemyProjectile", "CannonLeft", "CannonRight", "CannonUp",
           "CannonDown", "RocketUp", "RocketDown"}


def boot(root):
    """Import PyElectroMan from `root`; returns its modules as a namespace."""
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
    m = types.SimpleNamespace(gl=gl, da=da, di=di, ga=ga, pl=pl, ot=ot, snd=snd, XY=XY)
    gl.data_folder = "data"

    # Load each sprite set's images once: a trace builds a fresh level and hero
    # for every scenario, and decoding the PNGs again each time dominated the
    # run time. Sprites are read-only here, so sharing them changes nothing.
    load_set = da.SpriteSet.load
    loaded = {}

    def load_set_once(self, set_name):
        if set_name not in loaded:
            load_set(self, set_name)
            loaded[set_name] = (self.set, self.sprites)
        self.__init__()
        self.set, sprites = loaded[set_name]
        self.sprites = list(sprites)

    da.SpriteSet.load = load_set_once
    gl.enemies = ot.Enemies()
    gl.weapons = ot.Weapons()
    gl.info = ot.Info()
    gl.checkpoint = ga.ActiveCheckpoint()
    return m


def patch(m, teleport_time=12):
    gl, ga, pl = m.gl, m.ga, m.pl
    m.di.message = lambda *args, **kwargs: None
    # The debug status line is only emptied when drawn; headless, it would grow
    # by a few strings every tick and make each append slower (quadratic time).
    m.di.status_line.add = lambda text: None
    m.snd.play_sound = lambda *args, **kwargs: None
    pl.PlayerEntity.show_hud = lambda self: None
    # handle_touch saves the game at checkpoints through emmenu.
    sys.modules["emmenu"] = types.SimpleNamespace(save_current_game=lambda: False)
    pl.TELEPORT_TIME = teleport_time
    _teleport_order(m)
    _touch_handling(m)
    _weapons_and_death(m)
    _enemies(m)

    # G4: rebuilding the level after a death resets the active checkpoint to
    # the level start; we keep the last checkpoint.
    reset_level = ga.ScreenManager.reset_level

    def reset_level_keeping_checkpoint(self):
        c = gl.checkpoint
        saved = (c.level, c.screen, c.position)
        reset_level(self)
        c.level, c.screen, c.position = saved

    ga.ScreenManager.reset_level = reset_level_keeping_checkpoint


def _teleport_order(m):
    """G16: fade out, wait out of sight, move, fade in (PyElectroMan fades in
    first and waits after). Also bounds the teleport search to one round of
    the map column: PyElectroMan loops forever when a teleport has no partner."""
    gl, ga, pl, XY = m.gl, m.ga, m.pl, m.XY
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
        screens = [gl.screen_manager.inspect_screen(s) for s in range(256) if s % 16 == sn % 16]
        if any(isinstance(o, ga.Teleport) and o.get_position().x == start_pos.x
               for screen in screens if screen for o in screen.active):
            return find_teleport_target(self, start_pos)
        self.teleport_target = None

    P.state_teleport_out = state_teleport_out
    P.state_teleport_wait = state_teleport_wait
    P.state_teleport_in = state_teleport_in
    P.find_teleport_target = bounded_find_teleport_target


def _touch_handling(m):
    """PyElectroMan dedupes touched objects with set(), whose order depends on
    memory addresses; we keep the order they were touched in. And it takes the
    current screen number for checkpoints, disks, removals and teleport
    searches, which is wrong when the hero changed screens earlier in the tick;
    we use the screen the tick began on."""
    gl, pl = m.gl, m.pl
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


def _weapons_and_death(m):
    gl, pl = m.gl, m.pl

    def projectile_vanish(self):
        # Entity.vanish also deletes the first level object at the shot's
        # position from the level map; a bug, not ported.
        try:
            gl.screen_manager.get_screen().active.remove(self)
        except ValueError:
            pass

    def state_death(self, init=False):
        # G15: the original's explosion offsets, in original pixels (doubled here).
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
    pl.PlayerEntity.state_death = state_death


def _enemies(m):
    """G18: the original's offsets where PyElectroMan applies them undoubled."""
    gl, ga, pl, XY = m.gl, m.ga, m.pl, m.XY

    def die(self):
        # An explosion over the creature's middle: centre - 12 original pixels.
        bbox, pos = self.get_bbox(), self.get_position()
        pl.put_explosion(pos.x + bbox.x + bbox.w // 2 - 24, pos.y + bbox.y + bbox.h // 2 - 24)
        self.vanish()

    def fire_projectile(self):
        # A cannon's shot starts 1 original pixel (2 here) outside its box.
        cbox, pos = self.get_bbox(), self.get_position().copy()
        pbox = self.projectile_sprite.bbox
        cp = self.get_position()
        if self.direction.x < 0:
            pos.x = cp.x + cbox.x - (pbox.x + pbox.width) - 2
        elif self.direction.x > 0:
            pos.x = cp.x + cbox.x + cbox.width - pbox.x + 2
        elif self.direction.y < 0:
            pos.y = cp.y + cbox.y - (pbox.y + pbox.height) - 2
        elif self.direction.y > 0:
            pos.y = cp.y + cbox.y + cbox.height - pbox.y + 2
        velocity = XY(self.direction.x * self.projectile_speed, self.direction.y * self.projectile_speed)
        gl.screen_manager.add_active(ga.EnemyProjectile([self.projectile_sprite], pos, velocity))

    def enemy_projectile_vanish(self):
        # As for the hero's shots: no level map deletion at its position.
        try:
            gl.screen_manager.get_screen().active.remove(self)
        except ValueError:
            pass

    check_enemy_collision = pl.PlayerEntity.check_enemy_collision

    def check_enemy_collision_visible(self):
        # Out of sight between fading out and in (our teleport wait), unhurt.
        if self.state != self.state_teleport_wait:
            check_enemy_collision(self)

    ga.EnemyPlatform.die = die
    ga.EnemyFlying.die = die
    ga.CannonBase.fire_projectile = fire_projectile
    ga.EnemyProjectile.vanish = enemy_projectile_vanish
    pl.PlayerEntity.check_enemy_collision = check_enemy_collision_visible


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


def end_tick(gl):
    """Shots fired during the tick join the screen (PyElectroMan does this when
    drawing). Firing just before falling into an empty screen crashes
    PyElectroMan; the shots are dropped instead."""
    if gl.screen_manager.get_screen():
        gl.screen_manager.update_active()
    else:
        gl.screen_manager.new_objects = []


def object_coder(m, level):
    """Code for an object as compared: 'x,y:sprite', the sprite as a level
    index, 'w' + weapons index, 'e' + enem index, or '-' when hidden."""
    ids = {}
    for base, sset in ((0, level.set1), (64, level.set2)):
        for i, sprite in enumerate(sset.sprites):
            if sprite is not None:
                ids[id(sprite)] = str(base + i)
    for prefix, sset in (("w", m.gl.weapons.data), ("e", m.gl.enemies.data)):
        for i, sprite in enumerate(sset.sprites):
            if sprite is not None:
                ids.setdefault(id(sprite), "%s%d" % (prefix, i))

    def code(a):
        name = a.name()
        if name in ("EnemyPlatform", "EnemyFlying"):
            anim = a.anims[a.anim] if a.anims else []
            shown = ids.get(id(anim[a.frame]), "?") if a.frame < len(anim) else "-"
        elif name != "ExitIndicator" and getattr(a, "show", True) is False:
            shown = "-"
        else:
            shown = ids.get(id(a.sprites[a.frame % len(a.sprites)]), "?")
        return "%d,%d:%s" % (a.position.x // 2, a.position.y // 2, shown)

    return code
