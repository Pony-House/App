class TinyEventChecker {
  constructor() {
    this.tinyCache = {};
  }

  checkIds(roomId, eventId, ts = new Date().valueOf()) {
    const tinyId = `${roomId}:${eventId}`;
    if (typeof this.tinyCache[tinyId] !== 'number') {
      this.tinyCache[tinyId] = ts;
      return true;
    }
    return false;
  }

  check(mEvent) {
    return this.checkIds(mEvent.getRoomId(), mEvent.getId(), mEvent.getTs());
  }
}

export default TinyEventChecker;
