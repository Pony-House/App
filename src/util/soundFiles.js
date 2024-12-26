import tinyConsole from '@src/util/libs/console';

class SoundFiles {
  constructor() {
    this.files = {};
    this.add('fatal_beep', './sound/fatal_beep.ogg');
    this.add('notification', './sound/notification.ogg');
    this.add('invite', './sound/invite.ogg');
    this.add('micro_on', './sound/micro_on.ogg');
    this.add('micro_off', './sound/micro_off.ogg');
  }

  add(name, file) {
    this.remove(name);
    this.files[name] = new Audio(file);
  }

  remove(name) {
    if (this.files[name]) {
      delete this.files[name];
      return true;
    }
    return false;
  }

  get(file) {
    if (this.files[file]) {
      return this.files[file];
    }
  }

  play(file) {
    const sound = this.get(file);
    try {
      if (sound) {
        sound.play();
      }
    } catch (err) {
      tinyConsole.error(err);
    }
  }

  playNow(file) {
    const sound = this.get(file);
    try {
      if (sound) {
        if (sound.currentTime < 1) {
          sound.pause();
          sound.currentTime = 0;
        }
        sound.play();
      }
    } catch (err) {
      tinyConsole.error(err);
    }
  }
}

const soundFiles = new SoundFiles();
export default soundFiles;

if (__ENV_APP__.MODE === 'development') global.soundFiles = soundFiles;
