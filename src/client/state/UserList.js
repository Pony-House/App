import EventEmitter from 'events';
import { RoomEvent, RoomStateEvent } from 'matrix-js-sdk';
import storageManager from '@src/util/libs/localStorage/StorageManager';

import initMatrix from '../initMatrix';

class UserList extends EventEmitter {
  constructor(matrixClient) {
    super();
    this.setMaxListeners(__ENV_APP__.MAX_LISTENERS);
    this.matrixClient = matrixClient;
    this.users = new Map();
    this.rooms = new Map();

    this.populateRooms();
    this._listenEvents();
  }

  getUserRawRooms(userId) {
    const userData = this.users.get(userId);
    if (userData) {
      return userData.rooms;
    }
    return null;
  }

  getUserRooms(userId) {
    const rooms = this.getUserRawRooms(userId);
    if (rooms) {
      let using = false;
      const result = { spaces: [], rooms: [] };
      const checked = [];
      const { roomList } = initMatrix;

      const insertRoom = (roomId) => {
        if (checked.indexOf(roomId) < 0) {
          checked.push(roomId);
          if (roomList.isOrphan(roomId)) {
            if (roomList.spaces.has(roomId)) {
              using = true;
              result.spaces.push(roomId);
            } else if (!roomList.directs.has(roomId)) {
              using = true;
              result.rooms.push(roomId);
            }
          } else {
            const moreRooms = roomList.roomIdToParents.get(roomId);
            if (moreRooms) moreRooms.forEach((roomId2) => insertRoom(roomId2));
          }
        }
      };

      rooms.forEach((roomId) => insertRoom(roomId));
      if (using) return result;
    }
    return null;
  }

  getUser(userId) {
    const userData = this.users.get(userId);
    if (userData) {
      return userData;
    }
    return null;
  }

  _addUser(roomId, userId) {
    const userData = this.users.get(userId);
    if (userData) userData.rooms.add(roomId);
    else {
      const newUserData = {};
      newUserData.rooms = new Set();
      newUserData.rooms.add(roomId);
      this.users.set(userId, newUserData);
      this.emit('userCreated', userId);
      this.emit(`userCreated:${userId}`, true);
    }

    const roomData = this.rooms.get(roomId);
    if (roomData) roomData.users.add(userId);
    else {
      const newRoomData = {};
      newRoomData.users = new Set();
      newRoomData.users.add(userId);
      this.rooms.set(roomId, newRoomData);
    }
    this.emit('userAdded', roomId, userId);
    this.emit(`userAdded:${userId}`, roomId);
  }

  _removeUser(roomId, userId) {
    const userData = this.users.get(userId);
    if (userData) {
      userData.rooms.delete(roomId);
      if (userData.rooms.size < 1) {
        this.users.delete(userId);
        this.emit('userDeleted', userId);
        this.emit(`userDeleted:${userId}`, true);
      }
    }

    const roomData = this.rooms.get(roomId);
    if (roomData) {
      roomData.users.delete(userId);
      if (roomData.users.size < 1) this.rooms.delete(roomId);
    }
    this.emit('userRemoved', roomId, userId);
    this.emit(`userRemoved:${userId}`, roomId);
  }

  _removeRoom(roomId) {
    storageManager.deleteRoomDb(roomId);
    const roomData = this.rooms.get(roomId);
    if (roomData && roomData.users) {
      const removeData = [];
      roomData.users.forEach((userId) => {
        removeData.push(userId);
      });
      for (const item in removeData) {
        this._removeUser(roomId, removeData[item]);
      }
    }
  }

  populateRoom(room) {
    const tinyThis = this;
    if (__ENV_APP__.LOAD_ALL_TIMELINES_FIRST_START) storageManager.syncTimeline(room.roomId);
    room.getJoinedMembers().forEach((member) => {
      tinyThis._addUser(room.roomId, member.userId);
    });
  }

  populateRooms() {
    const tinyThis = this;
    this.matrixClient.getRooms().forEach((room) => {
      tinyThis.populateRoom(room);
    });
  }

  _listenEvents() {
    const tinyThis = this;
    const mx = this.matrixClient;

    const memberManage = (roomId, event) => {
      const content = event.getContent();
      const userId = event.getStateKey();
      if (typeof userId === 'string' && userId.length > 0) {
        if (content.membership === 'join') tinyThis._addUser(roomId, userId);
        else tinyThis._removeUser(roomId, userId);
      }
    };

    mx.on(RoomEvent.MyMembership, async (room, membership) => {
      if (room && membership === 'join') {
        if (__ENV_APP__.LOAD_ALL_TIMELINES_FIRST_START) storageManager.syncTimeline(room.roomId);
        room.getJoinedMembers().forEach((member) => {
          tinyThis._addUser(room.roomId, member.userId);
        });
      } else tinyThis._removeRoom(room.roomId);
    });

    mx.on(RoomStateEvent.Members, (mEvent, state) => {
      if (mEvent.getType() === 'm.room.member') memberManage(state.roomId, mEvent);
    });

    mx.on(RoomStateEvent.NewMember, (mEvent, state) => {
      if (mEvent.getType() === 'm.room.member') memberManage(state.roomId, mEvent);
    });
  }
}
export default UserList;
